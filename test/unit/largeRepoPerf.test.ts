import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitRepository } from '../../src/git/repository';
import { runGit } from '../../src/git/runner';
import { filterBranches, sortBranches } from '../../src/shared/filter';
import { computeWindow } from '../../src/shared/virtual';

const temps: string[] = [];

afterEach(async () => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

function updateRefsBatch(cwd: string, stdinContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['update-ref', '--stdin'], { cwd, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `git update-ref exited with ${code}`));
      else resolve();
    });
    child.stdin.write(stdinContent);
    child.stdin.end();
  });
}

describe('Large Repository Performance (1,000+ branches)', () => {
  it('reads, filters, sorts, and virtualizes 1,000+ branches within latency budgets', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bp-1000-'));
    temps.push(dir);

    await runGit(dir, ['init', '-b', 'main']);
    await runGit(dir, ['config', 'user.email', 'bench@example.com']);
    await runGit(dir, ['config', 'user.name', 'Bench User']);
    await runGit(dir, ['config', 'commit.gpgsign', 'false']);
    await writeFile(path.join(dir, 'app.ts'), 'export const app = true;\n');
    await runGit(dir, ['add', '.']);
    await runGit(dir, ['commit', '-m', 'chore: initial commit']);

    const headSha = (await runGit(dir, ['rev-parse', 'HEAD'])).trim();
    const lines: string[] = [];
    for (let i = 1; i <= 1000; i++) {
      lines.push(`create refs/heads/feat/task-${String(i).padStart(4, '0')} ${headSha}`);
    }
    await updateRefsBatch(dir, `${lines.join('\n')}\n`);

    const repo = await GitRepository.open(dir);
    expect(repo).toBeDefined();
    if (!repo) return;

    const t0 = performance.now();
    const state = await repo.snapshot();
    const snapshotMs = performance.now() - t0;

    expect(state.branches.length).toBe(1001);
    expect(snapshotMs).toBeLessThan(800);

    const t1 = performance.now();
    const filtered = sortBranches(
      filterBranches(state.branches, {
        filter: 'all',
        query: 'task-05',
        nowMs: Date.now(),
        staleDays: 90,
      }),
      state.baseBranch,
    );
    const win = computeWindow(state.branches.length, 270, 500, 54);
    const uiMs = performance.now() - t1;

    expect(filtered.length).toBeGreaterThan(10);
    expect(win.end - win.start).toBeLessThanOrEqual(25);
    expect(uiMs).toBeLessThan(50);
  });
});
