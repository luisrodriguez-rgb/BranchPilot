import { describe, expect, it } from 'vitest';
import { countByFilter, filterBranches, isStale, sortBranches } from '../../src/shared/filter';
import type { BranchInfo } from '../../src/shared/types';

const NOW = Date.UTC(2026, 0, 1);
const DAY = 86_400;
const nowSec = NOW / 1000;

function branch(name: string, over: Partial<BranchInfo> = {}, ageDays = 1): BranchInfo {
  return {
    name,
    fullRef: `refs/heads/${name}`,
    kind: 'local',
    isCurrent: false,
    merged: false,
    lastCommit: { hash: 'abc', subject: `trabajo en ${name}`, author: 'Ana', date: nowSec - ageDays * DAY },
    ...over,
  };
}

const sample: BranchInfo[] = [
  branch('main', {}, 2),
  branch('feat/pdf-export', { isCurrent: true }, 1),
  branch('fix/auth', { merged: true }, 10),
  branch('origin/feat/ui', { kind: 'remote' }, 5),
  branch('old/experiment', {}, 200),
];

describe('filterBranches', () => {
  it('filtra por tipo', () => {
    const run = (filter: 'local' | 'remote') => filterBranches(sample, { filter, query: '', nowMs: NOW }).map((b) => b.name);
    expect(run('remote')).toEqual(['origin/feat/ui']);
    expect(run('local')).toHaveLength(4);
  });

  it('filtra fusionadas y antiguas', () => {
    expect(filterBranches(sample, { filter: 'merged', query: '', nowMs: NOW }).map((b) => b.name)).toEqual(['fix/auth']);
    expect(filterBranches(sample, { filter: 'stale', query: '', nowMs: NOW }).map((b) => b.name)).toEqual(['old/experiment']);
  });

  it('busca por nombre y asunto, sin distinguir mayúsculas y con varios términos', () => {
    expect(filterBranches(sample, { filter: 'all', query: 'PDF', nowMs: NOW })).toHaveLength(1);
    expect(filterBranches(sample, { filter: 'all', query: 'feat ui', nowMs: NOW }).map((b) => b.name)).toEqual(['origin/feat/ui']);
    expect(filterBranches(sample, { filter: 'all', query: 'trabajo en auth', nowMs: NOW })).toHaveLength(1);
    expect(filterBranches(sample, { filter: 'all', query: 'zzz', nowMs: NOW })).toHaveLength(0);
  });

  it('respeta staleDays configurado', () => {
    expect(filterBranches(sample, { filter: 'stale', query: '', nowMs: NOW, staleDays: 7 }).map((b) => b.name)).toEqual([
      'fix/auth',
      'old/experiment',
    ]);
  });
});

describe('isStale', () => {
  it('nunca marca como antigua la rama actual', () => {
    expect(isStale(branch('x', { isCurrent: true }, 999), NOW, 90)).toBe(false);
  });
});

describe('countByFilter', () => {
  it('cuenta cada categoría', () => {
    expect(countByFilter(sample, NOW)).toEqual({ all: 5, local: 4, remote: 1, merged: 1, stale: 1 });
  });
});

describe('sortBranches', () => {
  it('pone la actual primero, luego la base y luego por actividad', () => {
    expect(sortBranches(sample, 'main').map((b) => b.name)).toEqual([
      'feat/pdf-export',
      'main',
      'origin/feat/ui',
      'fix/auth',
      'old/experiment',
    ]);
  });

  it('no muta la lista original', () => {
    const copy = [...sample];
    sortBranches(sample, 'main');
    expect(sample).toEqual(copy);
  });
});
