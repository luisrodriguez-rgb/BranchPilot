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

const BASE_ENV = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };

function executeGit(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env,
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
}

/**
 * Ejecuta `git` de solo lectura sin shell. `GIT_OPTIONAL_LOCKS=0` evita que las
 * lecturas tomen `index.lock` y choquen con operaciones del usuario o del agente.
 */
export const runGit: GitRunner = (cwd, args) =>
  executeGit(cwd, args, { ...BASE_ENV, GIT_OPTIONAL_LOCKS: '0' });

/**
 * Ejecuta `git` para operaciones que modifican el repositorio (checkout, branch, stash),
 * manteniendo los locks normales de Git para garantizar atomicidad.
 */
export const runGitWrite: GitRunner = (cwd, args) => executeGit(cwd, args, BASE_ENV);

