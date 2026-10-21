import * as vscode from 'vscode';
import { GitError } from './git/runner';
import { evaluateGuard, validateBranchName } from './guards/branchGuards';
import type { ConfirmPrompt, DirtyPrompt, DirtyResolution, GuardAction, GuardContext } from './guards/branchGuards';
import type { RepoService } from './repoService';
import { readSettings } from './settings';
import type { BranchInfo, RepoState } from './shared/types';

export const CHECKOUT_COMMAND = 'branchpilot.checkout';
export const CREATE_BRANCH_COMMAND = 'branchpilot.createBranch';
export const RENAME_BRANCH_COMMAND = 'branchpilot.renameBranch';
export const DELETE_BRANCH_COMMAND = 'branchpilot.deleteBranch';

function formatGitFailure(error: unknown): string {
  if (error instanceof GitError && error.stderr.trim()) {
    return error.stderr.trim().split('\n')[0] ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coordina las acciones de usuario sobre ramas (cambiar, crear, renombrar, eliminar)
 * aplicando siempre los guards de seguridad antes de modificar el repositorio.
 */
export class BranchActions {
  constructor(private readonly repos: RepoService) {}

  private requireState(): RepoState | undefined {
    const state = this.repos.state;
    if (!state) {
      void vscode.window.showWarningMessage('BranchPilot: No hay ningún repositorio Git abierto en el workspace.');
      return undefined;
    }
    return state;
  }

  private guardContext(state: RepoState): GuardContext {
    return {
      head: state.head,
      workingTree: state.workingTree,
      protection: readSettings().protection,
      baseBranch: state.baseBranch,
    };
  }

  private async runConfirmPrompts(confirms: ConfirmPrompt[]): Promise<boolean> {
    for (const prompt of confirms) {
      const choice = await vscode.window.showWarningMessage(
        prompt.message,
        { modal: true, detail: prompt.detail },
        prompt.confirmLabel,
      );
      if (choice !== prompt.confirmLabel) return false;
    }
    return true;
  }

  private async askDirtyResolution(prompt: DirtyPrompt): Promise<DirtyResolution> {
    const stashOption = 'Guardar en stash y continuar';
    const proceedOption = 'Cambiar llevando cambios';
    const choice = await vscode.window.showWarningMessage(
      prompt.message,
      { modal: true, detail: prompt.detail },
      stashOption,
      proceedOption,
    );
    if (choice === stashOption) return 'stash';
    if (choice === proceedOption) return 'proceed';
    return 'cancel';
  }

  private async verifyAndPrepare(action: GuardAction, state: RepoState): Promise<boolean> {
    const decision = evaluateGuard(action, this.guardContext(state));
    if (decision.status === 'blocked') {
      void vscode.window.showErrorMessage(`BranchPilot: ${decision.reason}`);
      return false;
    }
    if (!(await this.runConfirmPrompts(decision.confirms))) return false;
    if (decision.dirtyPrompt) {
      const resolution = await this.askDirtyResolution(decision.dirtyPrompt);
      if (resolution === 'cancel') return false;
      if (resolution === 'stash') {
        await this.repos.stashPush(`BranchPilot: antes de ${action.kind}`);
      }
    }
    return true;
  }

  /** Cambia a `fullRef` (o abre un selector rápido si no se indica). */
  async checkout(fullRef?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let targetRef = fullRef;
    if (!targetRef) {
      const picked = await this.pickBranch(state.branches.filter((b) => !b.isCurrent), 'Selecciona la rama a la que deseas cambiar');
      if (!picked) return;
      targetRef = picked.fullRef;
    }

    const branch = state.branches.find((b) => b.fullRef === targetRef || b.name === targetRef);
    if (branch?.isCurrent) return;
    const displayTarget = branch?.name ?? targetRef.replace(/^refs\/(heads|remotes)\//, '');

    if (!(await this.verifyAndPrepare({ kind: 'checkout', target: displayTarget }, state))) return;

    try {
      const switched = await this.repos.checkout(branch?.fullRef ?? targetRef);
      void vscode.window.setStatusBarMessage(`BranchPilot: En rama «${switched}»`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo cambiar a «${displayTarget}»: ${formatGitFailure(error)}`);
    }
  }

  /** Crea una rama nueva pidiendo nombre y rama base (o usando `baseRef` si se proporciona). */
  async createBranch(baseRef?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let chosenBase = baseRef;
    if (!chosenBase) {
      const pickedBase = await this.pickBaseBranch(state);
      if (!pickedBase) return;
      chosenBase = pickedBase;
    }

    const existingLocal = new Set(state.branches.filter((b) => b.kind === 'local').map((b) => b.name));
    const rawName = await vscode.window.showInputBox({
      title: `Nueva rama (base: ${chosenBase})`,
      prompt: 'Introduce el nombre de la nueva rama (p. ej. feat/mi-tarea)',
      placeHolder: 'feat/nueva-rama',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const err = validateBranchName(value);
        if (err) return err;
        if (existingLocal.has(value.trim())) return `Ya existe una rama local llamada «${value.trim()}».`;
        return undefined;
      },
    });
    const name = rawName?.trim();
    if (!name) return;

    await this.repos.refresh();
    const freshState = this.requireState();
    if (!freshState) return;

    if (!(await this.verifyAndPrepare({ kind: 'createBranch', name, base: chosenBase }, freshState))) return;

    try {
      await this.repos.createBranch(name, chosenBase);
      void vscode.window.setStatusBarMessage(`BranchPilot: Creada y activa «${name}»`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo crear la rama «${name}»: ${formatGitFailure(error)}`);
    }
  }

  /** Renombra una rama local existente. */
  async renameBranch(fullRef?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let branch = fullRef ? state.branches.find((b) => b.fullRef === fullRef || b.name === fullRef) : undefined;
    if (!branch) {
      branch = await this.pickBranch(
        state.branches.filter((b) => b.kind === 'local'),
        'Selecciona la rama local que deseas renombrar',
      );
      if (!branch) return;
    }

    if (branch.kind !== 'local') {
      void vscode.window.showErrorMessage('BranchPilot: Solo se pueden renombrar ramas locales.');
      return;
    }

    const existingLocal = new Set(state.branches.filter((b) => b.kind === 'local').map((b) => b.name));
    const rawNewName = await vscode.window.showInputBox({
      title: `Renombrar rama «${branch.name}»`,
      prompt: 'Introduce el nuevo nombre para la rama',
      value: branch.name,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const clean = value.trim();
        if (clean === branch.name) return 'Introduce un nombre distinto al actual.';
        const err = validateBranchName(clean);
        if (err) return err;
        if (existingLocal.has(clean)) return `Ya existe una rama local llamada «${clean}».`;
        return undefined;
      },
    });
    const newName = rawNewName?.trim();
    if (!newName) return;

    await this.repos.refresh();
    const freshState = this.requireState();
    if (!freshState) return;

    if (!(await this.verifyAndPrepare({ kind: 'renameBranch', from: branch.name, to: newName }, freshState))) return;

    try {
      await this.repos.renameBranch(branch.name, newName);
      void vscode.window.setStatusBarMessage(`BranchPilot: Rama renombrada a «${newName}»`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo renombrar «${branch.name}»: ${formatGitFailure(error)}`);
    }
  }

  /** Elimina una rama local previa confirmación. */
  async deleteBranch(fullRef?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let branch = fullRef ? state.branches.find((b) => b.fullRef === fullRef || b.name === fullRef) : undefined;
    if (!branch) {
      branch = await this.pickBranch(
        state.branches.filter((b) => b.kind === 'local' && !b.isCurrent && b.name !== state.baseBranch),
        'Selecciona la rama local que deseas eliminar',
      );
      if (!branch) return;
    }

    if (!(await this.verifyAndPrepare({ kind: 'deleteBranch', branch }, state))) return;

    try {
      await this.repos.deleteBranch(branch.name, !branch.merged);
      void vscode.window.setStatusBarMessage(`BranchPilot: Rama «${branch.name}» eliminada`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo eliminar «${branch.name}»: ${formatGitFailure(error)}`);
    }
  }

  private async pickBranch(branches: BranchInfo[], placeHolder: string): Promise<BranchInfo | undefined> {
    if (branches.length === 0) {
      void vscode.window.showInformationMessage('BranchPilot: No hay ramas disponibles para esta acción.');
      return undefined;
    }
    const items = branches.map((b) => ({
      label: b.name,
      description: b.kind === 'local' ? 'local' : 'remota',
      detail: `${b.lastCommit.hash} · ${b.lastCommit.subject}`,
      branch: b,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true, matchOnDetail: true });
    return picked?.branch;
  }

  private async pickBaseBranch(state: RepoState): Promise<string | undefined> {
    const options: Array<{ label: string; description: string; value: string }> = [];
    const seen = new Set<string>();
    const addOption = (value: string, description: string): void => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      options.push({ label: value, description, value });
    };

    if (state.baseBranch) addOption(state.baseBranch, 'rama base del repositorio');
    if (!state.head.detached && state.head.branch) addOption(state.head.branch, 'rama actual');
    else if (state.head.shortHash) addOption('HEAD', `commit actual (${state.head.shortHash})`);

    for (const b of state.branches) {
      addOption(b.name, b.kind === 'local' ? 'rama local' : 'rama remota');
    }

    if (options.length === 0) return 'HEAD';

    const picked = await vscode.window.showQuickPick(options, {
      title: 'Crear nueva rama: elige la rama base',
      placeHolder: 'Selecciona desde qué rama partirá la nueva rama',
    });
    return picked?.value;
  }
}
