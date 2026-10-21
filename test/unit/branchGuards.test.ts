import { describe, expect, it } from 'vitest';
import { evaluateGuard, validateBranchName } from '../../src/guards/branchGuards';
import type { GuardContext } from '../../src/guards/branchGuards';
import type { BranchInfo, WorkingTreeStatus } from '../../src/shared/types';

const CLEAN_WT: WorkingTreeStatus = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };

function makeCtx(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    head: { branch: 'main', detached: false, shortHash: 'abc1234' },
    workingTree: { ...CLEAN_WT },
    protection: { mode: 'all', protectedBranches: ['main', 'master', 'develop'] },
    baseBranch: 'main',
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: 'feat/login',
    fullRef: 'refs/heads/feat/login',
    kind: 'local',
    isCurrent: false,
    merged: true,
    lastCommit: { hash: '1234567', subject: 'feat: login', author: 'Test', date: 1_700_000_000 },
    ...overrides,
  };
}

describe('validateBranchName', () => {
  it('acepta nombres válidos con barras, guiones y puntos', () => {
    expect(validateBranchName('feat/nueva-rama_1.0')).toBeUndefined();
    expect(validateBranchName('fix/bug-123')).toBeUndefined();
  });

  it('rechaza nombres vacíos, reservados o peligrosos', () => {
    expect(validateBranchName('')).toBeDefined();
    expect(validateBranchName('   ')).toBeDefined();
    expect(validateBranchName('HEAD')).toBeDefined();
    expect(validateBranchName('@')).toBeDefined();
    expect(validateBranchName('-flag')).toBeDefined();
    expect(validateBranchName('feat..x')).toBeDefined();
    expect(validateBranchName('feat/con espacio')).toBeDefined();
    expect(validateBranchName('feat/rama.lock')).toBeDefined();
    expect(validateBranchName('/inicio')).toBeDefined();
    expect(validateBranchName('final/')).toBeDefined();
  });
});

describe('evaluateGuard', () => {
  it('bloquea checkout y creación cuando hay merge/rebase/cherry-pick en curso', () => {
    for (const operation of ['merge', 'rebase', 'cherry-pick', 'revert', 'bisect'] as const) {
      const ctx = makeCtx({ workingTree: { ...CLEAN_WT, operation } });
      const resCheckout = evaluateGuard({ kind: 'checkout', target: 'feat/a' }, ctx);
      expect(resCheckout).toMatchObject({ status: 'blocked' });
      const resCreate = evaluateGuard({ kind: 'createBranch', name: 'feat/b' }, ctx);
      expect(resCreate).toMatchObject({ status: 'blocked' });
    }
  });

  it('bloquea checkout cuando existen archivos en conflicto aunque no haya operación activa', () => {
    const ctx = makeCtx({ workingTree: { ...CLEAN_WT, conflicted: 2 } });
    const decision = evaluateGuard({ kind: 'checkout', target: 'feat/a' }, ctx);
    expect(decision).toEqual({
      status: 'blocked',
      reason: 'Hay 2 archivos en conflicto. Resuélvelos antes de cambiar de rama.',
    });
  });

  it('pide confirmación de rama protegida en modo all, list (si coincide) y la omite en off', () => {
    const action = { kind: 'checkout', target: 'feat/a' } as const;

    const allRes = evaluateGuard(action, makeCtx());
    expect(allRes.status).toBe('proceed');
    if (allRes.status === 'proceed') {
      expect(allRes.confirms.map((c) => c.id)).toEqual(['protectedCurrent']);
    }

    const listOnMain = evaluateGuard(
      action,
      makeCtx({ protection: { mode: 'list', protectedBranches: ['main'] } }),
    );
    if (listOnMain.status === 'proceed') {
      expect(listOnMain.confirms.map((c) => c.id)).toEqual(['protectedCurrent']);
    }

    const listOnFeat = evaluateGuard(
      action,
      makeCtx({
        head: { branch: 'feat/x', detached: false },
        protection: { mode: 'list', protectedBranches: ['main'] },
      }),
    );
    if (listOnFeat.status === 'proceed') {
      expect(listOnFeat.confirms).toEqual([]);
    }

    const offRes = evaluateGuard(
      action,
      makeCtx({ protection: { mode: 'off', protectedBranches: ['main'] } }),
    );
    if (offRes.status === 'proceed') {
      expect(offRes.confirms).toEqual([]);
    }
  });

  it('incluye dirtyPrompt cuando hay cambios sin guardar en checkout o createBranch', () => {
    const ctx = makeCtx({
      protection: { mode: 'off', protectedBranches: [] },
      workingTree: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 },
    });
    const decision = evaluateGuard({ kind: 'checkout', target: 'feat/a' }, ctx);
    expect(decision.status).toBe('proceed');
    if (decision.status === 'proceed') {
      expect(decision.dirtyPrompt?.changesCount).toBe(3);
      expect(decision.dirtyPrompt?.message).toContain('3 cambios sin guardar');
    }
  });

  it('valida el nombre y bloquea o confirma en renameBranch', () => {
    expect(evaluateGuard({ kind: 'renameBranch', from: 'feat/a', to: 'feat/a' }, makeCtx())).toMatchObject({
      status: 'blocked',
    });
    expect(evaluateGuard({ kind: 'renameBranch', from: 'feat/a', to: 'invalida..x' }, makeCtx())).toMatchObject({
      status: 'blocked',
    });

    const ok = evaluateGuard({ kind: 'renameBranch', from: 'main', to: 'principal' }, makeCtx());
    expect(ok.status).toBe('proceed');
    if (ok.status === 'proceed') {
      expect(ok.confirms.map((c) => c.id)).toEqual(['renameProtected']);
    }
  });

  it('protege deleteBranch: bloquea remotas, actual y base; distingue fusionada de no fusionada', () => {
    const ctx = makeCtx();
    expect(
      evaluateGuard({ kind: 'deleteBranch', branch: makeBranch({ kind: 'remote', name: 'origin/x' }) }, ctx),
    ).toMatchObject({ status: 'blocked' });

    expect(
      evaluateGuard({ kind: 'deleteBranch', branch: makeBranch({ name: 'main', isCurrent: true }) }, ctx),
    ).toMatchObject({ status: 'blocked' });

    expect(
      evaluateGuard({ kind: 'deleteBranch', branch: makeBranch({ name: 'main', isCurrent: false }) }, ctx),
    ).toMatchObject({ status: 'blocked' });

    const merged = evaluateGuard({ kind: 'deleteBranch', branch: makeBranch({ merged: true }) }, ctx);
    if (merged.status === 'proceed') {
      expect(merged.confirms.map((c) => c.id)).toEqual(['deleteBranch']);
    }

    const unmerged = evaluateGuard({ kind: 'deleteBranch', branch: makeBranch({ merged: false }) }, ctx);
    if (unmerged.status === 'proceed') {
      expect(unmerged.confirms.map((c) => c.id)).toEqual(['deleteUnmerged']);
    }
  });
});
