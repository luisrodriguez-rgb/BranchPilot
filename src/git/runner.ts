import { execFile } from 'node:child_process';

export type GitRunner = (cwd: string, args: string[]) => Promise<string>;

export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | undefined,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Ejecuta `git` sin shell. `GIT_OPTIONAL_LOCKS=0` evita que las lecturas
 * tomen `index.lock` y choquen con operaciones del usuario o del agente.
 */
export const runGit: GitRunner = (cwd, args) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === 'number' ? error.code : undefined;
          reject(new GitError(`git ${args.join(' ')} falló: ${stderr || error.message}`, code, String(stderr)));
          return;
        }
        resolve(stdout);
      },
    );
  });
