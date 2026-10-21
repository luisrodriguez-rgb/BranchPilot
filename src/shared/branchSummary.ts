import type { BranchInfo } from './types';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Relación de la rama con la base, en lenguaje natural. */
export function divergenceText(branch: BranchInfo, baseBranch: string | undefined): string | undefined {
  if (!baseBranch) return undefined;
  if (branch.kind === 'local' && branch.name === baseBranch) return 'Es la rama base.';
  if (branch.ahead === undefined || branch.behind === undefined) return undefined;
  if (branch.ahead === 0 && branch.behind === 0) return `Al día con ${baseBranch}.`;
  const parts: string[] = [];
  if (branch.ahead > 0) parts.push(`${plural(branch.ahead, 'commit', 'commits')} por delante de ${baseBranch}`);
  if (branch.behind > 0) parts.push(`${plural(branch.behind, 'commit', 'commits')} por detrás de ${baseBranch}`);
  return `${parts.join(' · ')}.`;
}

export function integrationText(branch: BranchInfo, baseBranch: string | undefined): string | undefined {
  if (!baseBranch || (branch.kind === 'local' && branch.name === baseBranch)) return undefined;
  return branch.merged ? `Ya integrada en ${baseBranch}.` : `Sin integrar en ${baseBranch}.`;
}
