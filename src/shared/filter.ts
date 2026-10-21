import type { BranchInfo } from './types';

export type FilterId = 'all' | 'local' | 'remote' | 'merged' | 'stale';

export const DEFAULT_STALE_DAYS = 90;
const SECONDS_PER_DAY = 86_400;

export function isStale(branch: BranchInfo, nowMs: number, staleDays: number): boolean {
  if (branch.isCurrent) return false;
  return nowMs / 1000 - branch.lastCommit.date > staleDays * SECONDS_PER_DAY;
}

function matchesFilter(branch: BranchInfo, filter: FilterId, nowMs: number, staleDays: number): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'local':
      return branch.kind === 'local';
    case 'remote':
      return branch.kind === 'remote';
    case 'merged':
      return branch.merged;
    case 'stale':
      return isStale(branch, nowMs, staleDays);
  }
}

function matchesQuery(branch: BranchInfo, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${branch.name} ${branch.lastCommit.subject}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export interface FilterOptions {
  filter: FilterId;
  query: string;
  nowMs: number;
  staleDays?: number;
}

/** Ordena: actual primero, luego base, luego por actividad más reciente. */
export function sortBranches(branches: BranchInfo[], baseBranch?: string): BranchInfo[] {
  const rank = (b: BranchInfo): number => {
    if (b.isCurrent) return 0;
    if (b.kind === 'local' && b.name === baseBranch) return 1;
    return 2;
  };
  return [...branches].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const byDate = b.lastCommit.date - a.lastCommit.date;
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

export function filterBranches(branches: BranchInfo[], options: FilterOptions): BranchInfo[] {
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const tokens = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  return branches.filter(
    (b) => matchesFilter(b, options.filter, options.nowMs, staleDays) && matchesQuery(b, tokens),
  );
}

export function countByFilter(
  branches: BranchInfo[],
  nowMs: number,
  staleDays: number = DEFAULT_STALE_DAYS,
): Record<FilterId, number> {
  const counts: Record<FilterId, number> = { all: 0, local: 0, remote: 0, merged: 0, stale: 0 };
  for (const b of branches) {
    counts.all++;
    if (b.kind === 'local') counts.local++;
    else counts.remote++;
    if (b.merged) counts.merged++;
    if (isStale(b, nowMs, staleDays)) counts.stale++;
  }
  return counts;
}
