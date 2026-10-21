import type { ProtectionConfig } from '../shared/protection';
import { isListedProtected } from '../shared/protection';
import type { RepoState } from '../shared/types';
import { isDirty } from '../shared/types';

export interface AutoGuardCheckInput {
  previous: RepoState | undefined;
  current: RepoState | undefined;
  protection: ProtectionConfig;
  dismissedRoots: ReadonlySet<string>;
}

export interface AutoGuardAlert {
  root: string;
  repoName: string;
  branch: string;
  changesCount: number;
  message: string;
}

/**
 * Detecta la transición de un árbol limpio a sucio (o una edición en curso) mientras
 * el usuario o un agente de IA trabaja directamente sobre una rama protegida (`main`, `master`, etc.).
 * Devuelve una alerta solo una vez por transición o hasta que la rama vuelva a estar limpia.
 */
export function evaluateProtectedBranchEditAlert(input: AutoGuardCheckInput): AutoGuardAlert | undefined {
  const { previous, current, protection, dismissedRoots } = input;
  if (!current || protection.mode === 'off') return undefined;
  if (current.head.detached || !current.head.branch) return undefined;
  if (current.workingTree.operation || current.workingTree.conflicted > 0) return undefined;

  const branch = current.head.branch;
  const isProtected =
    isListedProtected(branch, protection.protectedBranches) ||
    (current.baseBranch !== undefined && branch === current.baseBranch);
  if (!isProtected) return undefined;

  const nowDirty = isDirty(current.workingTree);
  if (!nowDirty) return undefined;

  const key = `${current.root}@${branch}`;
  if (dismissedRoots.has(key)) return undefined;

  const wasSameBranch =
    previous !== undefined &&
    previous.root === current.root &&
    !previous.head.detached &&
    previous.head.branch === branch;
  const wasDirty = wasSameBranch && isDirty(previous.workingTree);

  // Dispara cuando el repositorio pasa de limpio a sucio en la rama protegida.
  if (wasSameBranch && !wasDirty) {
    const changesCount =
      current.workingTree.staged + current.workingTree.unstaged + current.workingTree.untracked;
    return {
      root: current.root,
      repoName: current.name,
      branch,
      changesCount,
      message: `Se detectaron ${changesCount} ${changesCount === 1 ? 'cambio' : 'cambios'} en la rama protegida «${branch}». ¿Quieres mover estos cambios a una nueva rama de tarea?`,
    };
  }

  return undefined;
}
