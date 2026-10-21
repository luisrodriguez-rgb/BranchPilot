export type Locale = 'es' | 'en';

export interface UiStrings {
  emptyTitle: string;
  emptyBody: string;
  currentBranchEyebrow: string;
  detachedBadge: string;
  protectedBadge: string;
  cleanBadge: string;
  changesBadge: (n: number) => string;
  conflictsBadge: (n: number) => string;
  operationBadge: (op: string) => string;
  noCommitsYet: string;
  versusBase: (base: string) => string;
  taskBranchBtn: string;
  precheckBtn: string;
  agentRulesBtn: string;
  rescueDirtyBtn: string;
  worktreesTitle: (n: number) => string;
  addWorktreeBtn: string;
  radarTitle: (n: number) => string;
  filterActiveRepos: (active: number, total: number, enabled: boolean) => string;
  searchPlaceholder: string;
  newBranchBtn: string;
  undoBtn: string;
  refreshBtnTitle: string;
  filterAll: string;
  filterLocal: string;
  filterRemote: string;
  filterMerged: string;
  filterStale: string;
  branchesCount: (visible: number, total: number) => string;
}

const ES_STRINGS: UiStrings = {
  emptyTitle: 'Sin repositorio Git',
  emptyBody: 'Abre una carpeta que contenga un repositorio Git para ver sus ramas.',
  currentBranchEyebrow: 'Rama actual',
  detachedBadge: 'Desacoplado',
  protectedBadge: 'Protegida',
  cleanBadge: 'Limpia',
  changesBadge: (n) => `${n} ${n === 1 ? 'cambio' : 'cambios'}`,
  conflictsBadge: (n) => `${n} en conflicto`,
  operationBadge: (op) => `Operación: ${op}`,
  noCommitsYet: 'Aún sin commits',
  versusBase: (base) => `Frente a ${base}: `,
  taskBranchBtn: 'Rama para tarea',
  precheckBtn: 'Pre-chequeo IA',
  agentRulesBtn: 'AGENTS.md',
  rescueDirtyBtn: 'Mover cambios a rama de tarea…',
  worktreesTitle: (n) => `Worktrees (${n})`,
  addWorktreeBtn: 'Worktree paralelo',
  radarTitle: (n) => `Radar Multi-Repo (${n})`,
  filterActiveRepos: (active, total, enabled) =>
    enabled ? `Con actividad (${active})` : `Filtrar activos (${active}/${total})`,
  searchPlaceholder: 'Buscar ramas…',
  newBranchBtn: 'Nueva',
  undoBtn: 'Deshacer',
  refreshBtnTitle: 'Actualizar ramas',
  filterAll: 'Todas',
  filterLocal: 'Locales',
  filterRemote: 'Remotas',
  filterMerged: 'Fusionadas',
  filterStale: 'Antiguas',
  branchesCount: (visible, total) => (visible === total ? `${total} ramas` : `${visible} de ${total} ramas`),
};

const EN_STRINGS: UiStrings = {
  emptyTitle: 'No Git Repository',
  emptyBody: 'Open a folder containing a Git repository to inspect its branches.',
  currentBranchEyebrow: 'Current branch',
  detachedBadge: 'Detached',
  protectedBadge: 'Protected',
  cleanBadge: 'Clean',
  changesBadge: (n) => `${n} ${n === 1 ? 'change' : 'changes'}`,
  conflictsBadge: (n) => `${n} conflicted`,
  operationBadge: (op) => `Operation: ${op}`,
  noCommitsYet: 'No commits yet',
  versusBase: (base) => `Versus ${base}: `,
  taskBranchBtn: 'Task branch',
  precheckBtn: 'AI Pre-check',
  agentRulesBtn: 'AGENTS.md',
  rescueDirtyBtn: 'Move changes to task branch…',
  worktreesTitle: (n) => `Worktrees (${n})`,
  addWorktreeBtn: 'Parallel worktree',
  radarTitle: (n) => `Multi-Repo Radar (${n})`,
  filterActiveRepos: (active, total, enabled) =>
    enabled ? `Active only (${active})` : `Filter active (${active}/${total})`,
  searchPlaceholder: 'Search branches…',
  newBranchBtn: 'New',
  undoBtn: 'Undo',
  refreshBtnTitle: 'Refresh branches',
  filterAll: 'All',
  filterLocal: 'Local',
  filterRemote: 'Remote',
  filterMerged: 'Merged',
  filterStale: 'Stale',
  branchesCount: (visible, total) => (visible === total ? `${total} branches` : `${visible} of ${total} branches`),
};

export function resolveLocale(languageTag?: string): Locale {
  if (!languageTag) return 'es';
  const normalized = languageTag.trim().toLowerCase();
  return normalized.startsWith('en') ? 'en' : 'es';
}

export function getUiStrings(languageTag?: string): UiStrings {
  return resolveLocale(languageTag) === 'en' ? EN_STRINGS : ES_STRINGS;
}
