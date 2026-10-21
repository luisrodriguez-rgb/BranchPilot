import { describe, expect, it } from 'vitest';
import { evaluateProtectedBranchEditAlert } from '../../src/guards/autoGuard';
import { DEFAULT_PROTECTION } from '../../src/shared/protection';
import type { RepoState } from '../../src/shared/types';

function makeState(branch: string, dirtyCount: number): RepoState {
  return {
    root: '/repo/demo',
    name: 'demo',
    head: {
      branch,
      detached: false,
      shortHash: 'abc1234',
    },
    baseBranch: 'main',
    workingTree: {
      staged: 0,
      unstaged: dirtyCount,
      untracked: 0,
      conflicted: 0,
    },
    branches: [],
    worktrees: [],
  };
}

describe('evaluateProtectedBranchEditAlert', () => {
  it('triggers alert when a protected branch transitions from clean to dirty', () => {
    const previous = makeState('main', 0);
    const current = makeState('main', 3);
    const res = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: DEFAULT_PROTECTION,
      dismissedRoots: new Set(),
    });
    expect(res).toBeDefined();
    expect(res?.branch).toBe('main');
    expect(res?.changesCount).toBe(3);
    expect(res?.message).toContain('3 cambios en la rama protegida «main»');
  });

  it('does not alert when branch was already dirty', () => {
    const previous = makeState('main', 1);
    const current = makeState('main', 3);
    const res = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: DEFAULT_PROTECTION,
      dismissedRoots: new Set(),
    });
    expect(res).toBeUndefined();
  });

  it('does not alert when branch is not protected', () => {
    const previous = makeState('feat/login-flow', 0);
    const current = makeState('feat/login-flow', 2);
    const res = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: DEFAULT_PROTECTION,
      dismissedRoots: new Set(),
    });
    expect(res).toBeUndefined();
  });

  it('does not alert when user already dismissed alert for this repo@branch', () => {
    const previous = makeState('main', 0);
    const current = makeState('main', 1);
    const res = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: DEFAULT_PROTECTION,
      dismissedRoots: new Set(['/repo/demo@main']),
    });
    expect(res).toBeUndefined();
  });

  it('does not alert when protection mode is off', () => {
    const previous = makeState('main', 0);
    const current = makeState('main', 2);
    const res = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: { ...DEFAULT_PROTECTION, mode: 'off' },
      dismissedRoots: new Set(),
    });
    expect(res).toBeUndefined();
  });
});
