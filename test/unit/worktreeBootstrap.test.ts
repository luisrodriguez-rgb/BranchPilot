import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootstrapWorktree, isSafeRelativePath } from '../../src/git/worktreeBootstrap';
import { createTempRepo } from '../helpers/tempRepo';

describe('isSafeRelativePath', () => {
  it('acepta rutas relativas internas y rechaza rutas absolutas o con ..', () => {
    expect(isSafeRelativePath('.env')).toBe(true);
    expect(isSafeRelativePath('config/.env.local')).toBe(true);
    expect(isSafeRelativePath('')).toBe(false);
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
    expect(isSafeRelativePath('../secret.txt')).toBe(false);
  });
});

describe('bootstrapWorktree', () => {
  it('copia archivos .env existentes y enlaza node_modules al nuevo worktree', async () => {
    const repo = createTempRepo();
    const targetDir = `${repo.dir}-wt-boot`;
    mkdirSync(targetDir, { recursive: true });

    try {
      writeFileSync(path.join(repo.dir, '.env'), 'API_KEY=123\n');
      mkdirSync(path.join(repo.dir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(path.join(repo.dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');

      const res = await bootstrapWorktree(repo.dir, targetDir, {
        copyFiles: ['.env', '.env.local', '../escape'],
        linkNodeModules: true,
      });

      expect(res.copiedFiles).toEqual(['.env']);
      expect(res.linkedNodeModules).toBe(true);
      expect(res.warnings.length).toBe(1);
      expect(readFileSync(path.join(targetDir, '.env'), 'utf8')).toBe('API_KEY=123\n');
      expect(lstatSync(path.join(targetDir, 'node_modules')).isSymbolicLink()).toBe(true);
    } finally {
      repo.cleanup();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
