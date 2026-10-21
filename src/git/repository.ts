import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateBranchName } from '../guards/branchGuards';
import type {
  BranchInfo,
  CommitSummary,
  GitOperation,
  HeadInfo,
  RepoState,
  WorkingTreeStatus,
  WorktreeInfo,
} from '../shared/types';
import { COMMIT_LOG_FORMAT, branchFormat, parseBranches, parseCommits, parseStatus, parseWorktrees } from './parse';
import type { GitRunner } from './runner';
import { GitError, runGit, runGitWrite } from './runner';
import { parseReflog } from './undoStack';
import type { ReflogEntry } from './undoStack';

const BASE_CANDIDATES = ['main', 'master', 'develop', 'trunk'];

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export class GitRepository {
  private constructor(
    readonly root: string,
    readonly gitDir: string,
    readonly commonDir: string,
    private readonly run: GitRunner,
    private readonly runWrite: GitRunner,
  ) {}

  /** Devuelve el repositorio que contiene `dir`, o `undefined` si no es un repo Git. */
  static async open(
    dir: string,
    run: GitRunner = runGit,
    runWrite: GitRunner = run === runGit ? runGitWrite : run,
  ): Promise<GitRepository | undefined> {
    try {
      const out = await run(dir, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir']);
      const [top, gitDir, commonDir] = out.split('\n').map((l) => l.trim());
      if (!top || !gitDir) return undefined;
      const common = commonDir ? path.resolve(dir, commonDir) : gitDir;
      return new GitRepository(path.normalize(top), path.normalize(gitDir), common, run, runWrite);
    } catch {
      return undefined;
    }
  }

  get name(): string {
    return path.basename(this.root);
  }

  async head(): Promise<HeadInfo> {
    let branch: string | undefined;
    try {
      branch = (await this.run(this.root, ['symbolic-ref', '--short', '-q', 'HEAD'])).trim() || undefined;
    } catch (error) {
      if (!(error instanceof GitError) || error.exitCode !== 1) throw error;
    }
    let shortHash: string | undefined;
    try {
      shortHash = (await this.run(this.root, ['rev-parse', '--short', 'HEAD'])).trim() || undefined;
    } catch {
      shortHash = undefined; // repositorio sin commits
    }
    const info: HeadInfo = { detached: !branch };
    if (branch) info.branch = branch;
    if (shortHash) info.shortHash = shortHash;
    return info;
  }

  private async localBranchExists(name: string): Promise<boolean> {
    try {
      await this.run(this.root, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Rama base local para comparar: la de `origin/HEAD`, o main/master/develop/trunk. */
  async detectBase(): Promise<string | undefined> {
    try {
      const remoteHead = (await this.run(this.root, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'])).trim();
      const name = remoteHead.replace(/^origin\//, '');
      if (name && (await this.localBranchExists(name))) return name;
    } catch {
      // sin origin/HEAD: se prueba con los candidatos
    }
    for (const candidate of BASE_CANDIDATES) {
      if (await this.localBranchExists(candidate)) return candidate;
    }
    return undefined;
  }

  async listBranches(baseBranch?: string): Promise<BranchInfo[]> {
    const refs = ['refs/heads', 'refs/remotes'];
    let branches: BranchInfo[];
    let withAheadBehind = false;

    if (baseBranch) {
      try {
        const out = await this.run(this.root, [
          'for-each-ref',
          `--format=${branchFormat(`refs/heads/${baseBranch}`)}`,
          ...refs,
        ]);
        branches = parseBranches(out, true);
        withAheadBehind = true;
      } catch {
        branches = [];
      }
    } else {
      branches = [];
    }

    if (!withAheadBehind) {
      // git < 2.41 no soporta %(ahead-behind:...): se lista sin esos datos.
      const out = await this.run(this.root, ['for-each-ref', `--format=${branchFormat()}`, ...refs]);
      branches = parseBranches(out, false);
    }

    if (baseBranch) {
      const merged = await this.mergedRefs(baseBranch);
      for (const b of branches) {
        const isBase = b.kind === 'local' && b.name === baseBranch;
        b.merged = !isBase && merged.has(b.fullRef);
      }
    }
    return branches;
  }

  /**
   * Últimos commits de una rama. `fullRef` debe ser una ref completa (`refs/heads/...`
   * o `refs/remotes/...`); cualquier otra cosa se rechaza para no pasar opciones a git.
   */
  async recentCommits(fullRef: string, limit = 15): Promise<CommitSummary[]> {
    if (!/^refs\/(heads|remotes)\//.test(fullRef)) throw new Error(`Referencia no válida: ${fullRef}`);
    const out = await this.run(this.root, ['log', `-n${Math.max(1, Math.floor(limit))}`, `--format=${COMMIT_LOG_FORMAT}`, fullRef, '--']);
    return parseCommits(out);
  }

  /**
   * Cambia a una rama local o remota (`refs/heads/...` o `refs/remotes/...` o nombre de rama local).
   * Si es una rama remota (`refs/remotes/<remote>/<name>`) y no existe localmente, crea la rama local
   * siguiendo a la remota; si ya existe localmente, cambia a la local.
   */
  async checkout(refOrName: string): Promise<string> {
    if (refOrName.startsWith('refs/heads/')) {
      const localName = refOrName.slice('refs/heads/'.length);
      const err = validateBranchName(localName);
      if (err) throw new Error(err);
      await this.runWrite(this.root, ['checkout', localName, '--']);
      return localName;
    }
    if (refOrName.startsWith('refs/remotes/')) {
      const remoteName = refOrName.slice('refs/remotes/'.length);
      const slash = remoteName.indexOf('/');
      const localName = slash >= 0 ? remoteName.slice(slash + 1) : remoteName;
      const err = validateBranchName(localName);
      if (err) throw new Error(err);
      if (await this.localBranchExists(localName)) {
        await this.runWrite(this.root, ['checkout', localName, '--']);
      } else {
        await this.runWrite(this.root, ['checkout', '--track', '-b', localName, refOrName, '--']);
      }
      return localName;
    }
    const err = validateBranchName(refOrName);
    if (err) throw new Error(err);
    await this.runWrite(this.root, ['checkout', refOrName, '--']);
    return refOrName;
  }

  /** Crea una nueva rama a partir de `base` (o `HEAD` si no se indica) y cambia a ella. */
  async createBranch(name: string, base?: string): Promise<void> {
    const clean = name.trim();
    const err = validateBranchName(clean);
    if (err) throw new Error(err);
    if (await this.localBranchExists(clean)) {
      throw new Error(`Ya existe una rama local llamada «${clean}».`);
    }
    if (base) {
      const baseClean = base.trim();
      if (baseClean.startsWith('-')) throw new Error(`Rama base no válida: ${baseClean}`);
      await this.runWrite(this.root, ['checkout', '-b', clean, baseClean, '--']);
    } else {
      await this.runWrite(this.root, ['checkout', '-b', clean]);
    }
  }

  /** Renombra una rama local existente. */
  async renameBranch(oldName: string, newName: string): Promise<void> {
    const from = oldName.trim();
    const to = newName.trim();
    const errFrom = validateBranchName(from);
    if (errFrom) throw new Error(errFrom);
    const errTo = validateBranchName(to);
    if (errTo) throw new Error(errTo);
    if (await this.localBranchExists(to)) {
      throw new Error(`Ya existe una rama local llamada «${to}».`);
    }
    await this.runWrite(this.root, ['branch', '-m', from, to]);
  }

  /** Devuelve el hash SHA completo al que apunta `ref`. */
  async resolveRefSha(ref: string): Promise<string> {
    const clean = ref.trim();
    if (!clean || clean.startsWith('-')) throw new Error(`Referencia no válida: ${ref}`);
    const out = await this.run(this.root, ['rev-parse', '--verify', `${clean}^{commit}`]);
    return out.trim();
  }

  /** Elimina una rama local (`-d` por defecto, `-D` si `force` es `true`) y devuelve el SHA donde apuntaba. */
  async deleteBranch(name: string, force = false): Promise<string> {
    const clean = name.trim();
    const err = validateBranchName(clean);
    if (err) throw new Error(err);
    const sha = await this.resolveRefSha(`refs/heads/${clean}`);
    await this.runWrite(this.root, ['branch', force ? '-D' : '-d', '--', clean]);
    return sha;
  }

  /** Restaura una rama local en un commit específico (p. ej. al deshacer una eliminación). */
  async restoreBranch(name: string, targetSha: string): Promise<void> {
    const clean = name.trim();
    const err = validateBranchName(clean);
    if (err) throw new Error(err);
    const sha = targetSha.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
      throw new Error(`SHA de commit no válido: ${targetSha}`);
    }
    if (await this.localBranchExists(clean)) {
      throw new Error(`Ya existe una rama local llamada «${clean}».`);
    }
    await this.runWrite(this.root, ['branch', '--', clean, sha]);
  }

  /** Consulta las últimas entradas del reflog de HEAD. */
  async recentReflog(limit = 10): Promise<ReflogEntry[]> {
    try {
      const out = await this.run(this.root, [
        'reflog',
        'show',
        'HEAD',
        `-n${limit}`,
        '--format=%H%x00%gD%x00%gs%x00',
      ]);
      return parseReflog(out);
    } catch {
      return [];
    }
  }

  /** Guarda los cambios actuales (incluyendo archivos sin seguimiento) en el stash. */
  async stashPush(message?: string): Promise<void> {
    const args = ['stash', 'push', '--include-untracked'];
    if (message) args.push('-m', message);
    await this.runWrite(this.root, args);
  }

  /** Lista todos los worktrees registrados en el repositorio. */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const out = await this.run(this.root, ['worktree', 'list', '--porcelain', '-z']);
      const parsed = parseWorktrees(out, this.root);
      for (const wt of parsed) {
        wt.path = path.normalize(wt.path);
        wt.isCurrent = wt.path === this.root;
      }
      return parsed;
    } catch {
      return [];
    }
  }

  /**
   * Crea un nuevo worktree en `targetDir`.
   * Si `options.newBranch` se especifica, crea una rama nueva (`-b`) a partir de `options.refOrBase` (o `HEAD`).
   * De lo contrario, acopla el worktree a la rama existente `options.refOrBase`.
   */
  async addWorktree(targetDir: string, options: { newBranch?: string; refOrBase?: string }): Promise<string> {
    const resolvedDir = path.resolve(this.root, targetDir);
    if (resolvedDir.startsWith('-')) throw new Error(`Ruta de worktree no válida: ${targetDir}`);

    const args = ['worktree', 'add'];
    if (options.newBranch) {
      const cleanNew = options.newBranch.trim();
      const err = validateBranchName(cleanNew);
      if (err) throw new Error(err);
      args.push('-b', cleanNew, resolvedDir);
      if (options.refOrBase) {
        const baseClean = options.refOrBase.trim();
        if (baseClean.startsWith('-')) throw new Error(`Rama base no válida: ${baseClean}`);
        args.push(baseClean);
      }
    } else if (options.refOrBase) {
      const branchClean = options.refOrBase.trim();
      const err = validateBranchName(branchClean);
      if (err) throw new Error(err);
      args.push(resolvedDir, branchClean);
    } else {
      throw new Error('Debes indicar una rama existente o una nueva rama para el worktree.');
    }

    await this.runWrite(this.root, args);
    return resolvedDir;
  }

  /** Quita un worktree secundario registrado en el repositorio. */
  async removeWorktree(targetDir: string, force = false): Promise<void> {
    const normalized = path.normalize(path.resolve(this.root, targetDir));
    if (normalized === this.root) {
      throw new Error('No se puede eliminar el worktree abierto actualmente.');
    }
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push('--', normalized);
    await this.runWrite(this.root, args);
  }

  private async mergedRefs(baseBranch: string): Promise<Set<string>> {
    try {
      const out = await this.run(this.root, [
        'for-each-ref',
        `--merged=refs/heads/${baseBranch}`,
        '--format=%(refname)',
        'refs/heads',
        'refs/remotes',
      ]);
      return new Set(out.split('\n').filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async workingTree(): Promise<WorkingTreeStatus> {
    const out = await this.run(this.root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const status: WorkingTreeStatus = parseStatus(out);
    const operation = await this.detectOperation();
    if (operation) status.operation = operation;
    return status;
  }

  async detectOperation(): Promise<GitOperation | undefined> {
    const checks: Array<[string, GitOperation]> = [
      ['MERGE_HEAD', 'merge'],
      ['rebase-merge', 'rebase'],
      ['rebase-apply', 'rebase'],
      ['CHERRY_PICK_HEAD', 'cherry-pick'],
      ['REVERT_HEAD', 'revert'],
      ['BISECT_LOG', 'bisect'],
    ];
    for (const [file, operation] of checks) {
      if (await exists(path.join(this.gitDir, file))) return operation;
    }
    return undefined;
  }

  /** Marca de tiempo (ms) del último fetch/pull conocido. */
  async lastFetch(): Promise<number | undefined> {
    try {
      return (await stat(path.join(this.commonDir, 'FETCH_HEAD'))).mtimeMs;
    } catch {
      return undefined;
    }
  }

  async snapshot(): Promise<RepoState> {
    const [head, baseBranch, workingTree, fetchedAt, worktrees] = await Promise.all([
      this.head(),
      this.detectBase(),
      this.workingTree(),
      this.lastFetch(),
      this.listWorktrees(),
    ]);
    const branches = await this.listBranches(baseBranch);
    const state: RepoState = { root: this.root, name: this.name, head, branches, worktrees, workingTree };
    if (baseBranch) state.baseBranch = baseBranch;
    if (fetchedAt !== undefined) state.fetchedAt = fetchedAt;
    return state;
  }
}
