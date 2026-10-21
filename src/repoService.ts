import * as vscode from 'vscode';
import { GitRepository } from './git/repository';
import { watchGitDir } from './git/watcher';
import type { Disposable } from './git/watcher';
import { debounce } from './shared/debounce';
import type { CommitSummary, RepoState } from './shared/types';

/**
 * Mantiene el estado del repositorio del workspace y avisa de cambios.
 * Un repositorio por ventana (el del primer workspace folder o el del editor activo).
 */
export class RepoService implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<RepoState | undefined>();
  readonly onDidChange = this.emitter.event;

  private repo: GitRepository | undefined;
  private watcher: Disposable | undefined;
  private current: RepoState | undefined;
  private inFlight: Promise<void> | undefined;
  private pending = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly scheduleRefresh = debounce(() => void this.refresh(), 300);

  get state(): RepoState | undefined {
    return this.current;
  }

  async start(): Promise<void> {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.resolveRepository()),
      vscode.window.onDidChangeActiveTextEditor(() => void this.resolveRepository()),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      vscode.workspace.onDidCreateFiles(() => this.scheduleRefresh()),
      vscode.workspace.onDidDeleteFiles(() => this.scheduleRefresh()),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) this.scheduleRefresh();
      }),
    );
    await this.resolveRepository();
  }

  private candidateFolder(): string | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active?.scheme === 'file') {
      const owner = vscode.workspace.getWorkspaceFolder(active);
      if (owner) return owner.uri.fsPath;
    }
    return folders[0]?.uri.fsPath;
  }

  private async resolveRepository(): Promise<void> {
    const folder = this.candidateFolder();
    const next = folder ? await GitRepository.open(folder) : undefined;
    if (next?.root === this.repo?.root && next?.gitDir === this.repo?.gitDir) return;

    this.watcher?.dispose();
    this.watcher = undefined;
    this.repo = next;
    this.current = undefined;
    if (next) this.watcher = watchGitDir(next.gitDir, () => this.scheduleRefresh());
    await this.refresh();
  }

  async recentCommits(fullRef: string): Promise<CommitSummary[]> {
    if (!this.repo) throw new Error('No hay repositorio abierto.');
    return this.repo.recentCommits(fullRef);
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
      this.emitter.fire(undefined);
      return;
    }
    try {
      this.current = await this.repo.snapshot();
    } catch (error) {
      console.error('[BranchPilot] no se pudo leer el repositorio', error);
      this.current = undefined;
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
