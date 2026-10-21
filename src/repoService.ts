import * as vscode from 'vscode';
import { GitRepository } from './git/repository';
import { watchGitDir } from './git/watcher';
import type { Disposable } from './git/watcher';
import { readSettings } from './settings';
import { debounce } from './shared/debounce';
import { discoverGitRoots, summarizeRepoState } from './shared/multiRepo';
import type { CommitSummary, RepoOverview, RepoState } from './shared/types';

/**
 * Mantiene el estado del repositorio activo y el resumen de todos los repositorios
 * descubiertos en el workspace o en `branchpilot.scanPaths`.
 */
export class RepoService implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<RepoState | undefined>();
  readonly onDidChange = this.emitter.event;

  private repo: GitRepository | undefined;
  private watcher: Disposable | undefined;
  private current: RepoState | undefined;
  private allRepos: RepoOverview[] = [];
  private manualRoot: string | undefined;
  private inFlight: Promise<void> | undefined;
  private pending = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly scheduleRefresh = debounce(() => void this.refresh(), 300);

  get state(): RepoState | undefined {
    return this.current;
  }

  get repositories(): RepoOverview[] {
    return this.allRepos;
  }

  async start(): Promise<void> {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.resolveRepository()),
      vscode.window.onDidChangeActiveTextEditor(() => void this.onActiveEditorChanged()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('branchpilot.scanPaths')) void this.resolveRepository();
      }),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      vscode.workspace.onDidCreateFiles(() => this.scheduleRefresh()),
      vscode.workspace.onDidDeleteFiles(() => this.scheduleRefresh()),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) this.scheduleRefresh();
      }),
    );
    await this.resolveRepository();
  }

  private async onActiveEditorChanged(): Promise<void> {
    if (this.manualRoot) return;
    await this.resolveRepository();
  }

  /** Selecciona explícitamente un repositorio descubierto como el activo del panel y la barra de estado. */
  async selectRepository(root: string): Promise<void> {
    const next = await GitRepository.open(root);
    if (!next) return;
    this.manualRoot = next.root;
    this.switchActiveRepo(next);
    await this.refresh();
  }

  private candidateFolder(): string | undefined {
    if (this.manualRoot) return this.manualRoot;
    const folders = vscode.workspace.workspaceFolders ?? [];
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active?.scheme === 'file') {
      const owner = vscode.workspace.getWorkspaceFolder(active);
      if (owner) return owner.uri.fsPath;
    }
    return folders[0]?.uri.fsPath;
  }

  private switchActiveRepo(next: GitRepository | undefined): void {
    if (next?.root === this.repo?.root && next?.gitDir === this.repo?.gitDir) return;
    this.watcher?.dispose();
    this.watcher = undefined;
    this.repo = next;
    this.current = undefined;
    if (next) this.watcher = watchGitDir(next.gitDir, () => this.scheduleRefresh());
  }

  private async resolveRepository(): Promise<void> {
    const folder = this.candidateFolder();
    let next = folder ? await GitRepository.open(folder) : undefined;
    if (!next) {
      const roots = await this.discoverCandidates();
      if (roots[0]) next = await GitRepository.open(roots[0]);
    }
    this.switchActiveRepo(next);
    await this.refresh();
  }

  private async discoverCandidates(): Promise<string[]> {
    const workspaceDirs = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const extraDirs = readSettings().scanPaths;
    return discoverGitRoots([...workspaceDirs, ...extraDirs]);
  }

  private requireRepo(): GitRepository {
    if (!this.repo) throw new Error('No hay repositorio abierto.');
    return this.repo;
  }

  async recentCommits(fullRef: string): Promise<CommitSummary[]> {
    return this.requireRepo().recentCommits(fullRef);
  }

  async checkout(refOrName: string): Promise<string> {
    const target = await this.requireRepo().checkout(refOrName);
    await this.refresh();
    return target;
  }

  async createBranch(name: string, base?: string): Promise<void> {
    await this.requireRepo().createBranch(name, base);
    await this.refresh();
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.requireRepo().renameBranch(oldName, newName);
    await this.refresh();
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.requireRepo().deleteBranch(name, force);
    await this.refresh();
  }

  async stashPush(message?: string): Promise<void> {
    await this.requireRepo().stashPush(message);
    await this.refresh();
  }

  async addWorktree(targetDir: string, options: { newBranch?: string; refOrBase?: string }): Promise<string> {
    const dir = await this.requireRepo().addWorktree(targetDir, options);
    await this.refresh();
    return dir;
  }

  async removeWorktree(targetDir: string, force = false): Promise<void> {
    await this.requireRepo().removeWorktree(targetDir, force);
    await this.refresh();
  }

  /** Refresca el estado; las llamadas simultáneas se agrupan en una sola ejecución extra. */
  refresh(): Promise<void> {
    if (this.inFlight) {
      this.pending = true;
      return this.inFlight;
    }
    this.inFlight = this.doRefresh().finally(() => {
      this.inFlight = undefined;
      if (this.pending) {
        this.pending = false;
        void this.refresh();
      }
    });
    return this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    if (!this.repo) {
      this.current = undefined;
      this.allRepos = [];
      this.emitter.fire(undefined);
      return;
    }
    const { staleDays } = readSettings();
    const nowMs = Date.now();
    try {
      this.current = await this.repo.snapshot();
    } catch (error) {
      console.error('[BranchPilot] no se pudo leer el repositorio', error);
      this.current = undefined;
    }

    try {
      const roots = await this.discoverCandidates();
      const activeRoot = this.current?.root;
      if (activeRoot && !roots.includes(activeRoot)) roots.unshift(activeRoot);

      const overviews: RepoOverview[] = [];
      for (const root of roots) {
        if (this.current && root === this.current.root) {
          overviews.push(summarizeRepoState(this.current, { isActive: true, nowMs, staleDays }));
          continue;
        }
        const other = await GitRepository.open(root);
        if (!other) continue;
        try {
          const snap = await other.snapshot();
          overviews.push(summarizeRepoState(snap, { isActive: false, nowMs, staleDays }));
        } catch {
          // ignorar repositorios secundarios dañados
        }
      }
      this.allRepos = overviews;
    } catch {
      this.allRepos = this.current ? [summarizeRepoState(this.current, { isActive: true, nowMs, staleDays })] : [];
    }

    this.emitter.fire(this.current);
  }

  dispose(): void {
    this.scheduleRefresh.cancel();
    this.watcher?.dispose();
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

