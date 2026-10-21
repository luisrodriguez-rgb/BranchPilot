import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_WORKTREE_COPY_FILES = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.test'];

export type PackageManagerId = 'pnpm' | 'bun' | 'yarn' | 'npm';

export interface PackageManagerDetection {
  manager?: PackageManagerId;
  isPnpmWorkspace: boolean;
  installCommand?: {
    bin: string;
    args: string[];
    display: string;
  };
}

export interface WorktreeBootstrapOptions {
  /** Lista de rutas relativas a copiar si existen en el repositorio origen y no en el worktree destino. */
  copyFiles: string[];
  /** Si es `true`, crea un enlace simbólico (`junction` en Windows, `dir` en Unix) de `node_modules` si existe en origen. */
  linkNodeModules: boolean;
}

export interface WorktreeBootstrapResult {
  copiedFiles: string[];
  linkedNodeModules: boolean;
  packageManager: PackageManagerDetection;
  skippedSymlinkForMonorepo: boolean;
  warnings: string[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Ensures a relative path stays strictly inside its root directory. */
export function isSafeRelativePath(rel: string): boolean {
  const trimmed = rel.trim();
  if (!trimmed || path.isAbsolute(trimmed)) return false;
  const normalized = path.normalize(trimmed);
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`) || normalized.includes('../')) {
    return false;
  }
  return true;
}

/**
 * Detecta el gestor de paquetes del repositorio (`pnpm`, `bun`, `yarn`, `npm`)
 * y si se trata de un monorepo con `pnpm-workspace.yaml`.
 */
export async function detectPackageManager(root: string): Promise<PackageManagerDetection> {
  const isPnpmWorkspace = await pathExists(path.join(root, 'pnpm-workspace.yaml'));
  if (isPnpmWorkspace || (await pathExists(path.join(root, 'pnpm-lock.yaml')))) {
    return {
      manager: 'pnpm',
      isPnpmWorkspace,
      installCommand: {
        bin: 'pnpm',
        args: ['install', '--prefer-offline'],
        display: 'pnpm install --prefer-offline',
      },
    };
  }
  if ((await pathExists(path.join(root, 'bun.lockb'))) || (await pathExists(path.join(root, 'bun.lock')))) {
    return {
      manager: 'bun',
      isPnpmWorkspace: false,
      installCommand: {
        bin: 'bun',
        args: ['install'],
        display: 'bun install',
      },
    };
  }
  if (await pathExists(path.join(root, 'yarn.lock'))) {
    return {
      manager: 'yarn',
      isPnpmWorkspace: false,
      installCommand: {
        bin: 'yarn',
        args: ['install', '--prefer-offline'],
        display: 'yarn install --prefer-offline',
      },
    };
  }
  if (await pathExists(path.join(root, 'package-lock.json'))) {
    return {
      manager: 'npm',
      isPnpmWorkspace: false,
      installCommand: {
        bin: 'npm',
        args: ['ci', '--prefer-offline'],
        display: 'npm ci --prefer-offline',
      },
    };
  }
  return { isPnpmWorkspace: false };
}

/** Ejecuta el comando de instalación de dependencias sin invocar shell. */
export function runPackageInstall(
  targetRoot: string,
  command: { bin: string; args: string[] },
  timeoutMs = 120_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = process.platform === 'win32' && !command.bin.endsWith('.cmd') ? `${command.bin}.cmd` : command.bin;
    execFile(
      bin,
      command.args,
      { cwd: targetRoot, timeout: timeoutMs, windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Prepara un nuevo worktree copiando archivos de entorno ignorados por Git (`.env`, `.env.local`, etc.)
 * y enlazando `node_modules` desde el árbol principal (salvo que sea un monorepo `pnpm-workspace.yaml`,
 * donde recomienda `pnpm install --prefer-offline` para mantener intactos los enlaces de subpaquetes).
 */
export async function bootstrapWorktree(
  sourceRoot: string,
  targetRoot: string,
  options: WorktreeBootstrapOptions,
): Promise<WorktreeBootstrapResult> {
  const copiedFiles: string[] = [];
  let linkedNodeModules = false;
  let skippedSymlinkForMonorepo = false;
  const warnings: string[] = [];

  for (const rel of options.copyFiles) {
    if (!isSafeRelativePath(rel)) {
      warnings.push(`Ruta ignorada por seguridad: ${rel}`);
      continue;
    }
    const srcFile = path.join(sourceRoot, rel);
    const dstFile = path.join(targetRoot, rel);
    if (!(await pathExists(srcFile)) || (await pathExists(dstFile))) continue;
    try {
      await mkdir(path.dirname(dstFile), { recursive: true });
      await copyFile(srcFile, dstFile);
      copiedFiles.push(rel);
    } catch (error) {
      warnings.push(`No se pudo copiar ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const packageManager = await detectPackageManager(sourceRoot);

  if (options.linkNodeModules) {
    if (packageManager.isPnpmWorkspace) {
      skippedSymlinkForMonorepo = true;
    } else {
      const srcModules = path.join(sourceRoot, 'node_modules');
      const dstModules = path.join(targetRoot, 'node_modules');
      if ((await pathExists(srcModules)) && !(await pathExists(dstModules))) {
        try {
          const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
          await symlink(srcModules, dstModules, symlinkType);
          linkedNodeModules = true;
        } catch (error) {
          warnings.push(
            `No se pudo enlazar node_modules: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  return {
    copiedFiles,
    linkedNodeModules,
    packageManager,
    skippedSymlinkForMonorepo,
    warnings,
  };
}
