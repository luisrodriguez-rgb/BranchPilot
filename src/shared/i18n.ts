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
  // Badges
  badgeRemote: string;
  badgeCurrent: string;
  badgeBase: string;
  badgeMerged: string;
  badgeProtected: string;
  badgeWorktree: string;
  // Tooltips
  taskBranchTooltip: string;
  precheckTooltip: string;
  agentRulesTooltip: string;
  rescueDirtyTooltip: string;
  addWorktreeTooltip: string;
  openWorktreeTooltip: (folder: string) => string;
  removeWorktreeTooltip: (folder: string) => string;
  undoBtnTooltip: string;
  refreshBtnTooltip: string;
  filterActiveReposTooltip: string;
  openRepoInWindowTooltip: (name: string) => string;
  checkoutActionTooltip: (branch: string) => string;
  createWorktreeActionTooltip: (branch: string) => string;
  newBranchFromTooltip: (branch: string) => string;
  renameBranchTooltip: (branch: string) => string;
  deleteBranchTooltip: (branch: string) => string;
  // Quick commit & SCM
  quickCommitBtn: string;
  quickCommitProtectedBtn: (branch: string) => string;
  quickCommitProtectedTooltip: (branch: string) => string;
  quickCommitPlaceholder: string;
  openScmTooltip: string;
  // Empty / Filter results
  noBranchesInRepo: string;
  noMatchingBranches: string;
  // Footer
  footerRemotesUpdated: (time: string) => string;
  footerNoFetch: string;
  footerNoBase: string;
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
  badgeRemote: 'remota',
  badgeCurrent: 'actual',
  badgeBase: 'base',
  badgeMerged: 'fusionada',
  badgeProtected: 'protegida',
  badgeWorktree: 'worktree',
  taskBranchTooltip: 'Crear rama aislada para una nueva tarea de IA',
  precheckTooltip: 'Verificar si la rama actual es segura para que un agente opere',
  agentRulesTooltip: 'Sincronizar AGENTS.md y reglas para LLMs en el repositorio',
  rescueDirtyTooltip: 'Trasladar cambios sin guardar hacia una nueva rama de tarea',
  addWorktreeTooltip: 'Crear un worktree paralelo en otra carpeta para otro agente',
  openWorktreeTooltip: (folder) => `Abrir worktree ${folder} en nueva ventana`,
  removeWorktreeTooltip: (folder) => `Quitar worktree ${folder}`,
  undoBtnTooltip: 'Deshacer la última acción de ramas (restaurar rama, etc.)',
  refreshBtnTooltip: 'Actualizar ramas y estado del repositorio',
  filterActiveReposTooltip: 'Filtrar repositorios con cambios sin guardar o worktrees paralelos',
  openRepoInWindowTooltip: (name) => `Abrir ${name} en una nueva ventana del IDE`,
  checkoutActionTooltip: (b) => `Cambiar a la rama ${b}`,
  createWorktreeActionTooltip: (b) => `Crear worktree paralelo para ${b}`,
  newBranchFromTooltip: (b) => `Nueva rama desde ${b}`,
  renameBranchTooltip: (b) => `Renombrar ${b}`,
  deleteBranchTooltip: (b) => `Eliminar ${b}`,
  quickCommitBtn: 'Commit',
  quickCommitProtectedBtn: (b) => `Commit en ${b}`,
  quickCommitProtectedTooltip: (b) => `Rama protegida (${b}): pedirá confirmación antes de hacer commit directo`,
  quickCommitPlaceholder: 'Mensaje de commit…',
  openScmTooltip: 'Abrir en Source Control para revisar cambios o autogenerar mensaje con Copilot',
  noBranchesInRepo: 'Este repositorio aún no tiene ramas.',
  noMatchingBranches: 'Ninguna rama coincide con el filtro.',
  footerRemotesUpdated: (time) => `Remotas actualizadas ${time} (último fetch).`,
  footerNoFetch: 'Sin fetch registrado: las ramas remotas pueden estar desactualizadas.',
  footerNoBase: 'No se detectó rama base; no se muestran ahead/behind.',
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
  badgeRemote: 'remote',
  badgeCurrent: 'current',
  badgeBase: 'base',
  badgeMerged: 'merged',
  badgeProtected: 'protected',
  badgeWorktree: 'worktree',
  taskBranchTooltip: 'Create isolated branch for a new AI task',
  precheckTooltip: 'Verify whether the current branch is safe for AI agents',
  agentRulesTooltip: 'Sync AGENTS.md and agent rules in repository',
  rescueDirtyTooltip: 'Move uncommitted changes to a new task branch',
  addWorktreeTooltip: 'Create parallel worktree in sibling folder for another agent',
  openWorktreeTooltip: (folder) => `Open worktree ${folder} in new window`,
  removeWorktreeTooltip: (folder) => `Remove worktree ${folder}`,
  undoBtnTooltip: 'Undo last branch action (restore deleted branch, etc.)',
  refreshBtnTooltip: 'Refresh branches and repository status',
  filterActiveReposTooltip: 'Filter repositories with pending changes or parallel worktrees',
  openRepoInWindowTooltip: (name) => `Open ${name} in a new IDE window`,
  checkoutActionTooltip: (b) => `Switch to branch ${b}`,
  createWorktreeActionTooltip: (b) => `Create parallel worktree for ${b}`,
  newBranchFromTooltip: (b) => `New branch from ${b}`,
  renameBranchTooltip: (b) => `Rename ${b}`,
  deleteBranchTooltip: (b) => `Delete ${b}`,
  quickCommitBtn: 'Commit',
  quickCommitProtectedBtn: (b) => `Commit to ${b}`,
  quickCommitProtectedTooltip: (b) => `Protected branch (${b}): will ask for confirmation before committing`,
  quickCommitPlaceholder: 'Commit message…',
  openScmTooltip: 'Open in Source Control to inspect diffs or generate message with Copilot',
  noBranchesInRepo: 'This repository has no branches yet.',
  noMatchingBranches: 'No branches match the current filter.',
  footerRemotesUpdated: (time) => `Remotes updated ${time} (last fetch).`,
  footerNoFetch: 'No fetch recorded: remote branches may be outdated.',
  footerNoBase: 'No base branch detected; ahead/behind not shown.',
};

export function resolveLocale(languageTag?: string): Locale {
  if (!languageTag) return 'es';
  const normalized = languageTag.trim().toLowerCase();
  return normalized.startsWith('en') ? 'en' : 'es';
}

export function getUiStrings(languageTag?: string): UiStrings {
  return resolveLocale(languageTag) === 'en' ? EN_STRINGS : ES_STRINGS;
}
