import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitRepository } from '../../src/git/repository';
import { createTempRepo } from '../helpers/tempRepo';
import type { TempRepo } from '../helpers/tempRepo';

describe('GitRepository', () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
    repo.commit('chore: initial');
  });
  afterEach(() => repo.cleanup());

  async function open(): Promise<GitRepository> {
    const opened = await GitRepository.open(repo.dir);
    expect(opened).toBeDefined();
    return opened as GitRepository;
  }

  it('devuelve undefined si git indica que no es un repositorio', async () => {
    const failing = () => Promise.reject(new Error('fatal: not a git repository'));
    expect(await GitRepository.open(repo.dir, failing)).toBeUndefined();
  });

  it('resuelve el directorio común aunque se abra desde una subcarpeta', async () => {
    repo.write('sub/dir/x.txt', 'x');
    const r = await GitRepository.open(path.join(repo.dir, 'sub', 'dir'));
    expect(r?.commonDir).toBe(path.join(repo.dir, '.git'));
    expect(r?.root).toBe(repo.dir);
  });

  it('detecta la rama actual y la base', async () => {
    const r = await open();
    expect(await r.head()).toMatchObject({ branch: 'main', detached: false });
    expect(await r.detectBase()).toBe('main');
  });

  it('detecta HEAD desacoplado', async () => {
    repo.git('checkout', '--detach');
    const head = await (await open()).head();
    expect(head.detached).toBe(true);
    expect(head.branch).toBeUndefined();
    expect(head.shortHash).toMatch(/^[0-9a-f]+$/);
  });

  it('calcula ahead/behind, fusionadas y la rama actual', async () => {
    repo.git('checkout', '-b', 'feat/a');
    repo.commit('feat: a1');
    repo.commit('feat: a2');
    repo.git('checkout', 'main');
    repo.git('branch', 'merged-one');
    repo.commit('chore: main avanza');
    repo.git('checkout', 'feat/a');

    const r = await open();
    const branches = await r.listBranches('main');
    const byName = Object.fromEntries(branches.map((b) => [b.name, b]));

    expect(byName['feat/a']).toMatchObject({ isCurrent: true, ahead: 2, behind: 1, merged: false, kind: 'local' });
    expect(byName['feat/a']?.lastCommit.subject).toBe('feat: a2');
    expect(byName['main']).toMatchObject({ isCurrent: false, ahead: 0, behind: 0, merged: false });
    expect(byName['merged-one']?.merged).toBe(true);
  });

  it('cuenta cambios del árbol de trabajo', async () => {
    repo.write('staged.txt', 'a');
    repo.git('add', 'staged.txt');
    repo.write('file.txt', 'modificado');
    repo.write('nuevo.txt', 'x');
    const status = await (await open()).workingTree();
    expect(status).toMatchObject({ staged: 1, unstaged: 1, untracked: 1, conflicted: 0 });
    expect(status.operation).toBeUndefined();
  });

  it('detecta un merge con conflictos', async () => {
    repo.git('checkout', '-b', 'other');
    repo.write('file.txt', 'otra versión');
    repo.git('commit', '-am', 'other');
    repo.git('checkout', 'main');
    repo.write('file.txt', 'versión main');
    repo.git('commit', '-am', 'main change');
    expect(() => repo.git('merge', 'other')).toThrow();
    const status = await (await open()).workingTree();
    expect(status.operation).toBe('merge');
    expect(status.conflicted).toBe(1);
  });

  it('funciona en un repositorio sin commits', async () => {
    const empty = createTempRepo();
    try {
      const r = (await GitRepository.open(empty.dir)) as GitRepository;
      const state = await r.snapshot();
      expect(state.head).toMatchObject({ branch: 'main', detached: false });
      expect(state.branches).toEqual([]);
    } finally {
      empty.cleanup();
    }
  });

  it('lee 200 ramas rápidamente', async () => {
    const headRef = repo.git('rev-parse', 'HEAD').trim();
    const dir = path.join(repo.dir, '.git', 'refs', 'heads', 'bulk');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 200; i++) writeFileSync(path.join(dir, `b${i}`), `${headRef}\n`);

    const r = await open();
    const started = performance.now();
    const state = await r.snapshot();
    const elapsed = performance.now() - started;

    expect(state.branches.length).toBe(201);
    expect(elapsed).toBeLessThan(500);
  });
});
