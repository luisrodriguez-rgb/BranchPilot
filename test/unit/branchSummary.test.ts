import { describe, expect, it } from 'vitest';
import { divergenceText, integrationText } from '../../src/shared/branchSummary';
import type { BranchInfo } from '../../src/shared/types';

function b(over: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: 'feat/x',
    fullRef: 'refs/heads/feat/x',
    kind: 'local',
    isCurrent: false,
    merged: false,
    lastCommit: { hash: 'a', subject: 's', author: 'x', date: 1 },
    ...over,
  };
}

describe('divergenceText', () => {
  it('describe adelante y atrás con singular/plural en español e inglés', () => {
    expect(divergenceText(b({ ahead: 1, behind: 2 }), 'main')).toBe('1 commit por delante de main · 2 commits por detrás de main.');
    expect(divergenceText(b({ ahead: 1, behind: 2 }), 'main', 'en')).toBe('1 commit ahead of main · 2 commits behind main.');
    expect(divergenceText(b({ ahead: 3, behind: 0 }), 'main')).toBe('3 commits por delante de main.');
    expect(divergenceText(b({ ahead: 3, behind: 0 }), 'main', 'en')).toBe('3 commits ahead of main.');
  });
  it('detecta ramas al día y la propia base en ambos idiomas', () => {
    expect(divergenceText(b({ ahead: 0, behind: 0 }), 'main')).toBe('Al día con main.');
    expect(divergenceText(b({ ahead: 0, behind: 0 }), 'main', 'en')).toBe('Up to date with main.');
    expect(divergenceText(b({ name: 'main' }), 'main')).toBe('Es la rama base.');
    expect(divergenceText(b({ name: 'main' }), 'main', 'en')).toBe('This is the base branch.');
  });
  it('devuelve undefined si no hay datos', () => {
    expect(divergenceText(b(), 'main')).toBeUndefined();
    expect(divergenceText(b({ ahead: 1, behind: 1 }), undefined)).toBeUndefined();
  });
});

describe('integrationText', () => {
  it('indica integración respecto a la base en ambos idiomas', () => {
    expect(integrationText(b({ merged: true }), 'main')).toBe('Ya integrada en main.');
    expect(integrationText(b({ merged: true }), 'main', 'en')).toBe('Already merged into main.');
    expect(integrationText(b(), 'main')).toBe('Sin integrar en main.');
    expect(integrationText(b(), 'main', 'en')).toBe('Not yet merged into main.');
    expect(integrationText(b({ name: 'main' }), 'main')).toBeUndefined();
    expect(integrationText(b(), undefined)).toBeUndefined();
  });
});
