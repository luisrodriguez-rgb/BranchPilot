import type { Locale } from './i18n';
import type { BranchInfo } from './types';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Relación de la rama con la base, en lenguaje natural (es / en). */
export function divergenceText(branch: BranchInfo, baseBranch: string | undefined, locale: Locale = 'es'): string | undefined {
  if (!baseBranch) return undefined;
  if (branch.kind === 'local' && branch.name === baseBranch) {
    return locale === 'en' ? 'This is the base branch.' : 'Es la rama base.';
  }
  if (branch.ahead === undefined || branch.behind === undefined) return undefined;
  if (branch.ahead === 0 && branch.behind === 0) {
    return locale === 'en' ? `Up to date with ${baseBranch}.` : `Al día con ${baseBranch}.`;
  }
  const parts: string[] = [];
  if (branch.ahead > 0) {
    parts.push(
      locale === 'en'
        ? `${plural(branch.ahead, 'commit', 'commits')} ahead of ${baseBranch}`
        : `${plural(branch.ahead, 'commit', 'commits')} por delante de ${baseBranch}`,
    );
  }
  if (branch.behind > 0) {
    parts.push(
      locale === 'en'
        ? `${plural(branch.behind, 'commit', 'commits')} behind ${baseBranch}`
        : `${plural(branch.behind, 'commit', 'commits')} por detrás de ${baseBranch}`,
    );
  }
  return `${parts.join(' · ')}.`;
}

export function integrationText(branch: BranchInfo, baseBranch: string | undefined, locale: Locale = 'es'): string | undefined {
  if (!baseBranch || (branch.kind === 'local' && branch.name === baseBranch)) return undefined;
  if (locale === 'en') {
    return branch.merged ? `Already merged into ${baseBranch}.` : `Not yet merged into ${baseBranch}.`;
  }
  return branch.merged ? `Ya integrada en ${baseBranch}.` : `Sin integrar en ${baseBranch}.`;
}

