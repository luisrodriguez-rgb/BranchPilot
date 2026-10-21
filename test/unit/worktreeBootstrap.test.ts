import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootstrapWorktree, detectPackageManager, isSafeRelativePath } from '../../src/git/worktreeBootstrap';
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

describe('bootstrapWorktree & detectPackageManager', () => {
  it('copia archivos .env existentes y enlaza node_modules al nuevo worktree', async () => {
    const repo = createTempRepo();
    const targetDir = `${repo.dir}-wt-boot`;
    mkdirSync(targetDir, { recursive: true });

    try {
      writeFileSync(path.join(repo.dir, '.env'), 'API_KEY=123\n');
      writeFileSync(path.join(repo.dir, 'package-lock.json'), '{}');
      mkdirSync(path.join(repo.dir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(path.join(repo.dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');

      const res = await bootstrapWorktree(repo.dir, targetDir, {
        copyFiles: ['.env', '.env.local', '../escape'],
        linkNodeModules: true,
      });

      expect(res.copiedFiles).toEqual(['.env']);
      expect(res.linkedNodeModules).toBe(true);
      expect(res.skippedSymlinkForMonorepo).toBe(false);
      expect(res.packageManager.manager).toBe('npm');
      expect(res.warnings.length).toBe(1);
      expect(readFileSync(path.join(targetDir, '.env'), 'utf8')).toBe('API_KEY=123\n');
      expect(lstatSync(path.join(targetDir, 'node_modules')).isSymbolicLink()).toBe(true);
    } finally {
      repo.cleanup();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('detecta monorepo pnpm-workspace.yaml y evita crear symlink único roto de node_modules', async () => {
    const repo = createTempRepo();
    const targetDir = `${repo.dir}-wt-pnpm`;
    mkdirSync(targetDir, { recursive: true });

    try {
      writeFileSync(path.join(repo.dir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
      writeFileSync(path.join(repo.dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
      mkdirSync(path.join(repo.dir, 'node_modules'), { recursive: true });

      const pm = await detectPackageManager(repo.dir);
      expect(pm.manager).toBe('pnpm');
      expect(pm.isPnpmWorkspace).toBe(true);
      expect(pm.installCommand?.display).toBe('pnpm install --prefer-offline');

      const res = await bootstrapWorktree(repo.dir, targetDir, {
        copyFiles: [],
        linkNodeModules: true,
      });

      expect(res.linkedNodeModules).toBe(false);
      expect(res.skippedSymlinkForMonorepo).toBe(true);
      expect(existsSync(path.join(targetDir, 'node_modules'))).toBe(false);
    } finally {
      repo.cleanup();
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
