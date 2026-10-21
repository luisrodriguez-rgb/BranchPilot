export type BranchKind = 'local' | 'remote';

export interface CommitSummary {
  hash: string;
  subject: string;
  author: string;
  /** Segundos desde epoch (UNIX). */
  date: number;
}

export interface BranchInfo {
  /** Nombre sin prefijo de ref: `feat/x` o `origin/feat/x`. */
  name: string;
  fullRef: string;
  kind: BranchKind;
  isCurrent: boolean;
  upstream?: string;
  /** Commits por delante de la rama base (si se pudo calcular). */
  ahead?: number;
  /** Commits por detrás de la rama base (si se pudo calcular). */
  behind?: number;
  /** Integrada en la rama base (la propia base nunca se marca). */
  merged: boolean;
  lastCommit: CommitSummary;
}

export interface HeadInfo {
  branch?: string;
  detached: boolean;
  shortHash?: string;
}

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

export interface WorkingTreeStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  operation?: GitOperation;
}

export interface RepoState {
  root: string;
  name: string;
  head: HeadInfo;
  baseBranch?: string;
  branches: BranchInfo[];
  workingTree: WorkingTreeStatus;
  /** Milisegundos desde epoch del último fetch conocido. */
  fetchedAt?: number;
}

export function isDirty(status: WorkingTreeStatus): boolean {
  return status.staged + status.unstaged + status.untracked + status.conflicted > 0;
}
