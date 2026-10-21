import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitRepository } from '../../src/git/repository';
import { runGit } from '../../src/git/runner';
import { UndoStack, describeUndoEntry, parseReflog } from '../../src/git/undoStack';

const temps: string[] = [];

async function initTempRepo(): Promise<{ dir: string; repo: GitRepository }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bp-undo-'));
  temps.push(dir);
  await runGit(dir, ['init', '-b', 'main']);
  await runGit(dir, ['config', 'user.email', 'test@example.com']);
  await runGit(dir, ['config', 'user.name', 'Test User']);
  await runGit(dir, ['config', 'commit.gpgsign', 'false']);
  await writeFile(path.join(dir, 'index.ts'), 'export const v = 1;\n');
  await runGit(dir, ['add', '.']);
  await runGit(dir, ['commit', '-m', 'chore: init']);
  const repo = await GitRepository.open(dir);
  if (!repo) throw new Error('No se pudo abrir repo temporal');
  return { dir, repo };
}

afterEach(async () => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe('UndoStack & Reflog', () => {
  it('stores and pops entries in LIFO order filtered by repository root', () => {
    const stack = new UndoStack(3);
    stack.push({
      kind: 'checkout',
      repoRoot: '/repo/a',
      previousRef: 'main',
      targetRef: 'feat/login',
      timestamp: 100,
    });
    stack.push({
      kind: 'deleteBranch',
      repoRoot: '/repo/b',
      branchName: 'fix/bug',
      targetSha: '1234567890abcdef',
      timestamp: 200,
    });
    stack.push({
      kind: 'renameBranch',
      repoRoot: '/repo/a',
      fromName: 'feat/login',
      toName: 'feat/auth',
      timestamp: 300,
    });

    const peekA = stack.peek('/repo/a');
    expect(peekA?.kind).toBe('renameBranch');
    expect(peekA ? describeUndoEntry(peekA) : '').toContain('feat/auth');

    const poppedB = stack.pop('/repo/b');
    expect(poppedB?.kind).toBe('deleteBranch');
    expect(stack.peek('/repo/b')).toBeUndefined();
    expect(stack.size).toBe(2);
  });

  it('parses git reflog output accurately', () => {
    const raw =
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\0HEAD@{0}\0checkout: moving from main to feat/ui\0\n' +
      'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5\0HEAD@{1}\0commit (initial): chore: init\0\n';
    const parsed = parseReflog(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      selector: 'HEAD@{0}',
      subject: 'checkout: moving from main to feat/ui',
    });
  });

  it('deletes a local branch returning its SHA and restores it via restoreBranch', async () => {
    const { dir, repo } = await initTempRepo();
    await repo.createBranch('feat/temp', 'main');
    await writeFile(path.join(dir, 'extra.ts'), 'export const x = 2;\n');
    await runGit(dir, ['add', '.']);
    await runGit(dir, ['commit', '-m', 'feat: work on temp']);
    await repo.checkout('main');

    const deletedSha = await repo.deleteBranch('feat/temp', true);
    expect(deletedSha).toMatch(/^[0-9a-f]{40}$/i);

    let state = await repo.snapshot();
    expect(state.branches.some((b) => b.name === 'feat/temp')).toBe(false);

    await repo.restoreBranch('feat/temp', deletedSha);
    state = await repo.snapshot();
    expect(state.branches.some((b) => b.name === 'feat/temp')).toBe(true);

    const reflog = await repo.recentReflog(5);
    expect(reflog.length).toBeGreaterThanOrEqual(2);
  });
});
