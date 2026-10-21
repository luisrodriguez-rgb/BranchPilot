import { describe, expect, it } from 'vitest';
import { buildStatusBarModel } from '../../src/shared/statusBarModel';
import { DEFAULT_PROTECTION } from '../../src/shared/protection';
import type { BranchInfo, RepoState } from '../../src/shared/types';

function state(over: Partial<RepoState> = {}): RepoState {
  return {
    root: '/r',
    name: 'r',
    head: { branch: 'feat/x', detached: false, shortHash: 'abc1234' },
    baseBranch: 'main',
    branches: [],
    workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
    ...over,
  };
}

const current: BranchInfo = {
  name: 'feat/x',
  fullRef: 'refs/heads/feat/x',
  kind: 'local',
  isCurrent: true,
  merged: false,
  ahead: 4,
  behind: 1,
  lastCommit: { hash: 'a', subject: 's', author: 'x', date: 1 },
};

describe('buildStatusBarModel', () => {
  it('muestra la rama y no advierte en una rama normal limpia', () => {
    const m = buildStatusBarModel(state({ branches: [current] }), DEFAULT_PROTECTION);
    expect(m.text).toBe('$(git-branch) feat/x');
    expect(m.warning).toBe(false);
    expect(m.tooltipLines.join('\n')).toContain('4 por delante, 1 por detrás');
    expect(m.tooltipLines).toContain('Árbol de trabajo limpio.');
  });

  it('marca cambios con * y resume el detalle', () => {
    const m = buildStatusBarModel(
      state({ workingTree: { staged: 1, unstaged: 2, untracked: 3, conflicted: 0 } }),
      DEFAULT_PROTECTION,
    );
    expect(m.text).toBe('$(git-branch) feat/x*');
    expect(m.tooltipLines).toContain('Cambios: 1 en stage, 2 sin stage, 3 sin seguimiento.');
  });

  it('resalta las ramas de la lista protegida', () => {
    const m = buildStatusBarModel(state({ head: { branch: 'main', detached: false } }), DEFAULT_PROTECTION);
    expect(m.warning).toBe(true);
    expect(m.tooltipLines.join('\n')).toContain('Rama protegida');
  });

  it('advierte en HEAD desacoplado', () => {
    const m = buildStatusBarModel(state({ head: { detached: true, shortHash: 'abc1234' } }), DEFAULT_PROTECTION);
    expect(m.text).toBe('$(git-commit) abc1234 (desacoplado)');
    expect(m.warning).toBe(true);
  });

  it('advierte con operaciones en curso o conflictos', () => {
    const m = buildStatusBarModel(
      state({ workingTree: { staged: 0, unstaged: 0, untracked: 0, conflicted: 2, operation: 'merge' } }),
      DEFAULT_PROTECTION,
    );
    expect(m.text).toContain('fusión en curso');
    expect(m.warning).toBe(true);
  });
});
