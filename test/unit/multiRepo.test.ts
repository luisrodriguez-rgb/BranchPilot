import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverGitRoots, summarizeRepoState } from '../../src/shared/multiRepo';
import type { RepoState } from '../../src/shared/types';
import { createTempRepo, git } from '../helpers/tempRepo';

describe('summarizeRepoState', () => {
  it('calcula ramas locales, sin fusionar, antiguas y cambios pendientes', () => {
    const nowSec = 1_700_000_000;
    const staleSec = nowSec - 120 * 86_400;

    const state: RepoState = {
      root: '/workspace/api',
      name: 'api',
      head: { branch: 'feat/auth', detached: false, shortHash: '111aaaa' },
      baseBranch: 'main',
      branches: [
        {
          name: 'main',
          fullRef: 'refs/heads/main',
          kind: 'local',
          isCurrent: false,
          merged: false,
          lastCommit: { hash: '000', subject: 'init', author: 'A', date: staleSec },
        },
        {
          name: 'feat/auth',
          fullRef: 'refs/heads/feat/auth',
          kind: 'local',
          isCurrent: true,
          merged: false,
          lastCommit: { hash: '111', subject: 'auth', author: 'A', date: nowSec },
        },
        {
          name: 'feat/old',
          fullRef: 'refs/heads/feat/old',
          kind: 'local',
          isCurrent: false,
          merged: true,
          lastCommit: { hash: '222', subject: 'old', author: 'A', date: staleSec },
        },
        {
          name: 'origin/main',
          fullRef: 'refs/remotes/origin/main',
          kind: 'remote',
          isCurrent: false,
          merged: false,
          lastCommit: { hash: '000', subject: 'init', author: 'A', date: nowSec },
        },
      ],
      worktrees: [],
      workingTree: { staged: 1, unstaged: 2, untracked: 0, conflicted: 0 },
    };

    const summary = summarizeRepoState(state, { isActive: true, nowMs: nowSec * 1000, staleDays: 90 });
    expect(summary).toEqual({
      root: '/workspace/api',
      name: 'api',
      branch: 'feat/auth',
      detached: false,
      shortHash: '111aaaa',
      baseBranch: 'main',
      dirty: true,
      changesCount: 3,
      conflicted: 0,
      operation: undefined,
      localBranches: 3,
      unmergedLocalBranches: 1,
      staleLocalBranches: 1,
      worktreesCount: 1,
      isActive: true,
    });
  });
});

describe('discoverGitRoots', () => {
  it('descubre repositorios directos y subcarpetas de primer nivel en una carpeta contenedora', async () => {
    const direct = createTempRepo();
    const parentDir = `${direct.dir}-parent`;
    const subA = path.join(parentDir, 'service-a');
    const subB = path.join(parentDir, 'service-b');
    const nonGit = path.join(parentDir, 'docs');

    mkdirSync(subA, { recursive: true });
    mkdirSync(subB, { recursive: true });
    mkdirSync(nonGit, { recursive: true });
    git(subA, 'init', '-b', 'main');
    git(subB, 'init', '-b', 'main');

    try {
      const roots = await discoverGitRoots([direct.dir, parentDir]);
      expect(roots).toContain(direct.dir);
      expect(roots).toContain(subA);
      expect(roots).toContain(subB);
      expect(roots).not.toContain(nonGit);
    } finally {
      direct.cleanup();
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});
