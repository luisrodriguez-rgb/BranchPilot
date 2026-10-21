import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { GitRepository } from '../git/repository';
import { isStale } from './filter';
import type { RepoOverview, RepoState } from './types';
import { isDirty } from './types';

/** Resume un `RepoState` en un objeto compacto `RepoOverview` para el dashboard multi-repositorio. */
export function summarizeRepoState(
  state: RepoState,
  options: { isActive: boolean; nowMs?: number; staleDays?: number },
): RepoOverview {
  const nowMs = options.nowMs ?? Date.now();
  const staleDays = options.staleDays ?? 90;
  const wt = state.workingTree;
  const changesCount = wt.staged + wt.unstaged + wt.untracked + wt.conflicted;

  let localBranches = 0;
  let unmergedLocalBranches = 0;
  let staleLocalBranches = 0;

  for (const b of state.branches) {
    if (b.kind !== 'local') continue;
    localBranches++;
    const isBase = state.baseBranch !== undefined && b.name === state.baseBranch;
    if (!isBase && !b.merged) unmergedLocalBranches++;
    if (!b.isCurrent && !isBase && isStale(b, nowMs, staleDays)) staleLocalBranches++;
  }

  return {
    root: state.root,
    name: state.name,
    branch: state.head.branch,
    detached: state.head.detached,
    shortHash: state.head.shortHash,
    baseBranch: state.baseBranch,
    dirty: isDirty(wt),
    changesCount,
    conflicted: wt.conflicted,
    operation: wt.operation,
    localBranches,
    unmergedLocalBranches,
    staleLocalBranches,
    worktreesCount: state.worktrees.length || 1,
    isActive: options.isActive,
  };
}

/**
 * Descubre repositorios Git a partir de una lista de rutas candidatas
 * (carpetas del workspace y sus subcarpetas de primer nivel si una carpeta agrupa varios proyectos).
 */
export async function discoverGitRoots(candidateDirs: Iterable<string>): Promise<string[]> {
  const seen = new Set<string>();
  const roots: string[] = [];

  const tryOpenExactOrResolved = async (dir: string): Promise<string | undefined> => {
    const repo = await GitRepository.open(dir);
    return repo?.root;
  };

  const addRoot = (root: string): void => {
    if (!seen.has(root)) {
      seen.add(root);
      roots.push(root);
    }
  };

  for (const rawDir of candidateDirs) {
    const dir = path.normalize(rawDir);
    const resolvedRoot = await tryOpenExactOrResolved(dir);
    if (resolvedRoot === dir) {
      addRoot(resolvedRoot);
      continue;
    }

    // Si `dir` no es él mismo la raíz de un repo (aunque tenga un repo ancestro),
    // explorar sus subcarpetas de primer nivel para descubrir repos anidados.
    let foundChildren = false;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const childPath = path.normalize(path.join(dir, entry.name));
        const childRoot = await tryOpenExactOrResolved(childPath);
        if (childRoot === childPath) {
          addRoot(childRoot);
          foundChildren = true;
        }
      }
    } catch {
      // ignorar carpetas inaccesibles
    }

    if (!foundChildren && resolvedRoot) {
      addRoot(resolvedRoot);
    }
  }

  return roots;
}
