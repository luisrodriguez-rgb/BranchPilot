import { access, copyFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_WORKTREE_COPY_FILES = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.test'];

export interface WorktreeBootstrapOptions {
  /** Lista de rutas relativas a copiar si existen en el repositorio origen y no en el worktree destino. */
  copyFiles: string[];
  /** Si es `true`, crea un enlace simbólico (`junction` en Windows, `dir` en Unix) de `node_modules` si existe en origen. */
  linkNodeModules: boolean;
}

export interface WorktreeBootstrapResult {
  copiedFiles: string[];
  linkedNodeModules: boolean;
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
 * Prepara un nuevo worktree copiando archivos de entorno ignorados por Git (`.env`, `.env.local`, etc.)
 * y enlazando `node_modules` desde el árbol principal para que el agente pueda compilar y correr tests al instante.
 */
export async function bootstrapWorktree(
  sourceRoot: string,
  targetRoot: string,
  options: WorktreeBootstrapOptions,
): Promise<WorktreeBootstrapResult> {
  const copiedFiles: string[] = [];
  let linkedNodeModules = false;
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

  if (options.linkNodeModules) {
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

  return { copiedFiles, linkedNodeModules, warnings };
}
