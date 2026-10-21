import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import type { BranchInfo, CommitSummary, GitOperation, HeadInfo, RepoState, WorkingTreeStatus } from '../shared/types';
import { COMMIT_LOG_FORMAT, branchFormat, parseBranches, parseCommits, parseStatus } from './parse';
import type { GitRunner } from './runner';
import { GitError, runGit } from './runner';

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
  ) {}

  /** Devuelve el repositorio que contiene `dir`, o `undefined` si no es un repo Git. */
  static async open(dir: string, run: GitRunner = runGit): Promise<GitRepository | undefined> {
    try {
      const out = await run(dir, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir']);
      const [top, gitDir, commonDir] = out.split('\n').map((l) => l.trim());
      if (!top || !gitDir) return undefined;
      const common = commonDir ? path.resolve(dir, commonDir) : gitDir;
      return new GitRepository(path.normalize(top), path.normalize(gitDir), common, run);
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
    const [head, baseBranch, workingTree, fetchedAt] = await Promise.all([
      this.head(),
      this.detectBase(),
      this.workingTree(),
      this.lastFetch(),
    ]);
    const branches = await this.listBranches(baseBranch);
    const state: RepoState = { root: this.root, name: this.name, head, branches, workingTree };
    if (baseBranch) state.baseBranch = baseBranch;
    if (fetchedAt !== undefined) state.fetchedAt = fetchedAt;
    return state;
  }
}
