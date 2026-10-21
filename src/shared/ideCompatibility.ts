import type { GitRunner } from '../git/runner';
import { runGit } from '../git/runner';

export type IdeFamily =
  | 'antigravity'
  | 'cursor'
  | 'windsurf'
  | 'kiro'
  | 'trae'
  | 'qoder'
  | 'vscodium'
  | 'vscode'
  | 'unknown';

export interface GitVersionInfo {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  /** `git >= 2.41` soporta `%(ahead-behind:...)` en `for-each-ref`. */
  supportsBatchAheadBehind: boolean;
  /** `git >= 2.15` soporta `git worktree list --porcelain -z`. */
  supportsWorktreePorcelainZ: boolean;
}

export interface CompatibilityReport {
  ideFamily: IdeFamily;
  appName: string;
  vscodeVersion: string;
  hasVscodeGitExtension: boolean;
  gitAvailable: boolean;
  gitVersion?: GitVersionInfo;
  notes: string[];
}

/** Detecta la familia de IDE a partir de `vscode.env.appName` o `uriScheme`. */
export function detectIdeFamily(appName: string, uriScheme = ''): IdeFamily {
  const haystack = `${appName} ${uriScheme}`.toLowerCase();
  if (haystack.includes('antigravity') || haystack.includes('agy')) return 'antigravity';
  if (haystack.includes('cursor')) return 'cursor';
  if (haystack.includes('windsurf') || haystack.includes('codeium')) return 'windsurf';
  if (haystack.includes('kiro')) return 'kiro';
  if (haystack.includes('trae')) return 'trae';
  if (haystack.includes('qoder') || haystack.includes('qwen')) return 'qoder';
  if (haystack.includes('vscodium') || haystack.includes('codium')) return 'vscodium';
  if (haystack.includes('visual studio code') || haystack.includes('vscode') || haystack.includes('code')) {
    return 'vscode';
  }
  return 'unknown';
}

function versionAtLeast(major: number, minor: number, reqMajor: number, reqMinor: number): boolean {
  return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}

/** Interpreta la salida de `git --version` (p. ej. `git version 2.45.2 (Apple Git-150)`). */
export function parseGitVersion(output: string): GitVersionInfo | undefined {
  const raw = output.trim();
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw);
  if (!match) return undefined;
  const major = Number.parseInt(match[1] ?? '0', 10);
  const minor = Number.parseInt(match[2] ?? '0', 10);
  const patch = Number.parseInt(match[3] ?? '0', 10);
  return {
    raw,
    major,
    minor,
    patch,
    supportsBatchAheadBehind: versionAtLeast(major, minor, 2, 41),
    supportsWorktreePorcelainZ: versionAtLeast(major, minor, 2, 15),
  };
}

/** Consulta la versión del binario `git` instalado en el sistema. */
export async function probeGitVersion(cwd: string, run: GitRunner = runGit): Promise<GitVersionInfo | undefined> {
  try {
    const out = await run(cwd, ['--version']);
    return parseGitVersion(out);
  } catch {
    return undefined;
  }
}

/** Construye un informe legible de compatibilidad del entorno actual. */
export function buildCompatibilityReport(input: {
  appName: string;
  uriScheme?: string;
  vscodeVersion: string;
  hasVscodeGitExtension: boolean;
  gitVersion?: GitVersionInfo;
}): CompatibilityReport {
  const ideFamily = detectIdeFamily(input.appName, input.uriScheme);
  const notes: string[] = [];

  if (!input.gitVersion) {
    notes.push('No se encontró un binario `git` accesible en el PATH del sistema.');
  } else {
    if (!input.gitVersion.supportsBatchAheadBehind) {
      notes.push(
        `Git ${input.gitVersion.major}.${input.gitVersion.minor} es anterior a 2.41: se listan las ramas en modo compatible (sin ahead/behind en lote).`,
      );
    } else {
      notes.push(
        `Git ${input.gitVersion.major}.${input.gitVersion.minor}.${input.gitVersion.patch} soporta todas las optimizaciones de BranchPilot (ahead/behind en lote y worktrees).`,
      );
    }
  }

  if (!input.hasVscodeGitExtension) {
    notes.push(
      'La extensión integrada `vscode.git` no está activa en este fork; BranchPilot opera al 100 % mediante su motor Git CLI autónomo.',
    );
  } else {
    notes.push('Extensión `vscode.git` detectada y motor Git CLI autónomo activo.');
  }

  return {
    ideFamily,
    appName: input.appName,
    vscodeVersion: input.vscodeVersion,
    hasVscodeGitExtension: input.hasVscodeGitExtension,
    gitAvailable: input.gitVersion !== undefined,
    gitVersion: input.gitVersion,
    notes,
  };
}
