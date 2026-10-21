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

export interface WorktreeInfo {
  /** Ruta absoluta del árbol de trabajo en disco. */
  path: string;
  /** Hash completo o corto del HEAD de ese worktree. */
  head: string;
  /** Nombre corto de la rama (`feat/x`), si no está desacoplado. */
  branch?: string;
  detached: boolean;
  /** Si es el árbol de trabajo principal del repositorio. */
  isMain: boolean;
  /** Si corresponde al árbol de trabajo abierto en esta ventana. */
  isCurrent: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface RepoOverview {
  root: string;
  name: string;
  branch?: string;
  detached: boolean;
  shortHash?: string;
  baseBranch?: string;
  dirty: boolean;
  changesCount: number;
  conflicted: number;
  operation?: GitOperation;
  localBranches: number;
  unmergedLocalBranches: number;
  staleLocalBranches: number;
  worktreesCount: number;
  isActive: boolean;
}

export interface RepoState {
  root: string;
  name: string;
  head: HeadInfo;
  baseBranch?: string;
  branches: BranchInfo[];
  worktrees: WorktreeInfo[];
  workingTree: WorkingTreeStatus;
  /** Milisegundos desde epoch del último fetch conocido. */
  fetchedAt?: number;
}

export function isDirty(status: WorkingTreeStatus): boolean {
  return status.staged + status.unstaged + status.untracked + status.conflicted > 0;
}


