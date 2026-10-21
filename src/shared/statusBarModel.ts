import { isListedProtected } from './protection';
import type { ProtectionConfig } from './protection';
import type { GitOperation, RepoState } from './types';
import { isDirty } from './types';

export interface StatusBarModel {
  text: string;
  tooltipLines: string[];
  /** Resalta el elemento (rama protegida, conflictos u operación en curso). */
  warning: boolean;
}

const OPERATION_LABEL: Record<GitOperation, string> = {
  merge: 'fusión en curso',
  rebase: 'rebase en curso',
  'cherry-pick': 'cherry-pick en curso',
  revert: 'revert en curso',
  bisect: 'bisect en curso',
};

export function buildStatusBarModel(state: RepoState, protection: ProtectionConfig): StatusBarModel {
  const { head, workingTree: wt } = state;
  const dirty = isDirty(wt);
  const label = head.detached ? (head.shortHash ?? 'HEAD') : (head.branch ?? 'HEAD');
  const protectedBranch = !head.detached && !!head.branch && isListedProtected(head.branch, protection.protectedBranches);

  let text = head.detached ? `$(git-commit) ${label} (desacoplado)` : `$(git-branch) ${label}`;
  if (dirty) text += '*';
  if (wt.operation) text += ` · ${OPERATION_LABEL[wt.operation]}`;

  const tooltipLines = [head.detached ? `HEAD desacoplado en ${label}` : `Rama actual: ${label}`];
  if (protectedBranch) tooltipLines.push('⚠ Rama protegida: confirma antes de delegar trabajo a un agente.');
  if (head.detached) tooltipLines.push('⚠ No estás en ninguna rama: los commits nuevos pueden perderse.');

  const current = state.branches.find((b) => b.isCurrent);
  if (current && state.baseBranch && current.name !== state.baseBranch && current.ahead !== undefined) {
    tooltipLines.push(`Respecto a ${state.baseBranch}: ${current.ahead} por delante, ${current.behind ?? 0} por detrás.`);
  }

  if (dirty) {
    const parts: string[] = [];
    if (wt.staged) parts.push(`${wt.staged} en stage`);
    if (wt.unstaged) parts.push(`${wt.unstaged} sin stage`);
    if (wt.untracked) parts.push(`${wt.untracked} sin seguimiento`);
    if (wt.conflicted) parts.push(`${wt.conflicted} en conflicto`);
    tooltipLines.push(`Cambios: ${parts.join(', ')}.`);
  } else {
    tooltipLines.push('Árbol de trabajo limpio.');
  }
  if (wt.operation) tooltipLines.push(`⚠ ${OPERATION_LABEL[wt.operation]}.`);

  return {
    text,
    tooltipLines,
    warning: protectedBranch || head.detached || wt.conflicted > 0 || wt.operation !== undefined,
  };
}
