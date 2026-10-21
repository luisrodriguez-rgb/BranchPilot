import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE_DIR = path.resolve(__dirname, '../../.tmp-test');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  });
}

export interface TempRepo {
  dir: string;
  git: (...args: string[]) => string;
  write: (file: string, content: string) => void;
  commit: (message: string, file?: string) => void;
  cleanup: () => void;
}

export function createTempRepo(): TempRepo {
  mkdirSync(BASE_DIR, { recursive: true });
  const dir = mkdtempSync(path.join(BASE_DIR, 'repo-'));
  git(dir, 'init', '-b', 'main');
  const write = (file: string, content: string): void => {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const commit = (message: string, file = 'file.txt'): void => {
    write(file, `${message}\n${Math.random()}`);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-m', message);
  };
  return {
    dir,
    git: (...args) => git(dir, ...args),
    write,
    commit,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
