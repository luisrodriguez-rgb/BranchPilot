import type { ProtectionConfig } from '../shared/protection';
import { requiresConfirmation } from '../shared/protection';
import type { BranchInfo, GitOperation, HeadInfo, WorkingTreeStatus } from '../shared/types';
import { isDirty } from '../shared/types';

export type GuardAction =
  | { kind: 'checkout'; target: string }
  | { kind: 'createBranch'; name: string; base?: string }
  | { kind: 'renameBranch'; from: string; to: string }
  | { kind: 'deleteBranch'; branch: BranchInfo };

export interface GuardContext {
  head: HeadInfo;
  workingTree: WorkingTreeStatus;
  protection: ProtectionConfig;
  baseBranch?: string;
}

export type DirtyResolution = 'proceed' | 'stash' | 'cancel';

export interface ConfirmPrompt {
  id: 'protectedCurrent' | 'deleteUnmerged' | 'deleteBranch' | 'renameProtected';
  message: string;
  detail: string;
  confirmLabel: string;
}

export interface DirtyPrompt {
  message: string;
  detail: string;
  changesCount: number;
}

export type GuardDecision =
  | { status: 'blocked'; reason: string }
  | { status: 'proceed'; confirms: ConfirmPrompt[]; dirtyPrompt?: DirtyPrompt };

const OPERATION_DESCRIPTION: Record<GitOperation, string> = {
  merge: 'una fusión (merge)',
  rebase: 'un rebase',
  'cherry-pick': 'un cherry-pick',
  revert: 'un revert',
  bisect: 'un bisect',
};

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

const VALID_BRANCH_RE = /^(?!\/|.*(?:\/\/|\.\.|@\{|\\|\s|~|\^|:|\?|\*|\[))(?!.*\.lock(?:\/|$))[^\s~^:?*[\\]+(?<!\/|\.)(?<!\.lock)$/;

/** Valida que un nombre de rama sea seguro y cumpla las reglas básicas de `git check-ref-format`. */
export function validateBranchName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return 'El nombre de la rama no puede estar vacío.';
  if (name === '@' || name === 'HEAD') return `«${name}» es un nombre reservado por Git.`;
  if (name.startsWith('-')) return 'El nombre de la rama no puede empezar por guion (-).';
  if (hasControlChars(name) || !VALID_BRANCH_RE.test(name)) {
    return 'Nombre de rama no válido (evita espacios, "..", "~", "^", ":", "?", "*", "[" o barras al inicio/final).';
  }
  return undefined;
}

function totalChanges(wt: WorkingTreeStatus): number {
  return wt.staged + wt.unstaged + wt.untracked + wt.conflicted;
}

function blockingReason(wt: WorkingTreeStatus): string | undefined {
  if (wt.operation) {
    const op = OPERATION_DESCRIPTION[wt.operation];
    return `No se puede cambiar ni operar sobre ramas mientras hay ${op} en curso. Resuelve o aborta la operación primero.`;
  }
  if (wt.conflicted > 0) {
    return `Hay ${wt.conflicted} ${wt.conflicted === 1 ? 'archivo en conflicto' : 'archivos en conflicto'}. Resuélvelos antes de cambiar de rama.`;
  }
  return undefined;
}

/**
 * Evalúa si una acción sobre ramas puede ejecutarse directamente, si debe
 * bloquearse o qué confirmaciones requiere antes de tocar el repositorio.
 */
export function evaluateGuard(action: GuardAction, ctx: GuardContext): GuardDecision {
  const { head, workingTree: wt, protection, baseBranch } = ctx;

  if (action.kind === 'createBranch') {
    const nameError = validateBranchName(action.name);
    if (nameError) return { status: 'blocked', reason: nameError };
  }

  if (action.kind === 'renameBranch') {
    const nameError = validateBranchName(action.to);
    if (nameError) return { status: 'blocked', reason: nameError };
    if (action.from === action.to) {
      return { status: 'blocked', reason: 'El nuevo nombre coincide con el nombre actual de la rama.' };
    }
  }

  if (action.kind === 'deleteBranch') {
    if (action.branch.kind !== 'local') {
      return { status: 'blocked', reason: 'Solo se pueden eliminar ramas locales desde BranchPilot.' };
    }
    if (action.branch.isCurrent || (!head.detached && head.branch === action.branch.name)) {
      return { status: 'blocked', reason: `No puedes eliminar la rama actual («${action.branch.name}»). Cambia a otra rama primero.` };
    }
    if (baseBranch && action.branch.name === baseBranch) {
      return { status: 'blocked', reason: `No se puede eliminar la rama base del repositorio («${baseBranch}»).` };
    }
  }

  if (action.kind === 'checkout' || action.kind === 'createBranch') {
    const blocked = blockingReason(wt);
    if (blocked) return { status: 'blocked', reason: blocked };
  }

  const confirms: ConfirmPrompt[] = [];
  let dirtyPrompt: DirtyPrompt | undefined;

  if (action.kind === 'checkout' || action.kind === 'createBranch') {
    const currentBranch = !head.detached ? head.branch : undefined;
    if (currentBranch && requiresConfirmation(currentBranch, protection)) {
      const targetDesc =
        action.kind === 'checkout' ? `cambiar a «${action.target}»` : `crear y cambiar a la rama «${action.name}»`;
      confirms.push({
        id: 'protectedCurrent',
        message: `¿Estás seguro de operar saliendo de la rama «${currentBranch}»?`,
        detail: `Vas a ${targetDesc}. Confirma que deseas dejar «${currentBranch}».`,
        confirmLabel: 'Sí, continuar',
      });
    }

    if (isDirty(wt)) {
      const count = totalChanges(wt);
      dirtyPrompt = {
        message: `Tienes ${count} ${count === 1 ? 'cambio sin guardar' : 'cambios sin guardar'} en el árbol de trabajo.`,
        detail:
          'Al cambiar de rama, los cambios sin guardar podrían entrar en conflicto o perderse. Puedes guardarlos en el stash antes de continuar o cambiar llevando los cambios contigo.',
        changesCount: count,
      };
    }
  }

  if (action.kind === 'renameBranch') {
    if (requiresConfirmation(action.from, protection)) {
      confirms.push({
        id: 'renameProtected',
        message: `¿Estás seguro de renombrar la rama «${action.from}» a «${action.to}»?`,
        detail: 'Renombrar una rama puede afectar tareas o configuraciones que apunten al nombre anterior.',
        confirmLabel: 'Renombrar rama',
      });
    }
  }

  if (action.kind === 'deleteBranch') {
    const { branch } = action;
    if (!branch.merged) {
      confirms.push({
        id: 'deleteUnmerged',
        message: `La rama «${branch.name}» no está fusionada${baseBranch ? ` en «${baseBranch}»` : ''}. ¿Eliminar de todos modos?`,
        detail: `Último commit: ${branch.lastCommit.hash} (${branch.lastCommit.subject || 'sin mensaje'}). Si la eliminas, sus commits dejarán de tener una rama asociada.`,
        confirmLabel: 'Eliminar sin fusionar',
      });
    } else {
      confirms.push({
        id: 'deleteBranch',
        message: `¿Eliminar la rama local «${branch.name}»?`,
        detail: `Esta rama ya está integrada${baseBranch ? ` en «${baseBranch}»` : ''}.`,
        confirmLabel: 'Eliminar rama',
      });
    }
  }

  return dirtyPrompt ? { status: 'proceed', confirms, dirtyPrompt } : { status: 'proceed', confirms };
}
