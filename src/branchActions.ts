import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { evaluateAgentPrecheck, suggestTaskBranchName, upsertAgentRuleInContent } from './ai/taskContext';
import { GitError } from './git/runner';
import { UndoStack, describeUndoEntry } from './git/undoStack';
import { bootstrapWorktree, runPackageInstall } from './git/worktreeBootstrap';
import { evaluateGuard, validateBranchName } from './guards/branchGuards';
import type { ConfirmPrompt, DirtyPrompt, DirtyResolution, GuardAction, GuardContext } from './guards/branchGuards';
import type { RepoService } from './repoService';
import { readSettings } from './settings';
import { buildCompatibilityReport, probeGitVersion } from './shared/ideCompatibility';
import { isListedProtected } from './shared/protection';
import type { BranchInfo, RepoState } from './shared/types';

export const CHECKOUT_COMMAND = 'branchpilot.checkout';
export const CREATE_BRANCH_COMMAND = 'branchpilot.createBranch';
export const RENAME_BRANCH_COMMAND = 'branchpilot.renameBranch';
export const DELETE_BRANCH_COMMAND = 'branchpilot.deleteBranch';
export const UNDO_LAST_ACTION_COMMAND = 'branchpilot.undoLastBranchAction';
export const CREATE_TASK_BRANCH_COMMAND = 'branchpilot.createTaskBranch';
export const MOVE_DIRTY_TO_TASK_COMMAND = 'branchpilot.moveDirtyToTaskBranch';
export const VERIFY_TASK_BRANCH_COMMAND = 'branchpilot.verifyBranchForTask';
export const SETUP_AGENT_RULES_COMMAND = 'branchpilot.setupAgentRules';
export const CREATE_WORKTREE_COMMAND = 'branchpilot.createWorktree';
export const OPEN_WORKTREE_COMMAND = 'branchpilot.openWorktree';
export const REMOVE_WORKTREE_COMMAND = 'branchpilot.removeWorktree';
export const DIAGNOSE_ENV_COMMAND = 'branchpilot.diagnoseEnvironment';
export const SWITCH_REPO_COMMAND = 'branchpilot.switchRepository';
export const OPEN_REPO_WINDOW_COMMAND = 'branchpilot.openRepositoryInWindow';

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
  private readonly undoStack = new UndoStack();

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
      worktrees: state.worktrees,
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

    const previousRef = state.head.detached ? (state.head.shortHash ?? '') : (state.head.branch ?? '');
    try {
      const switched = await this.repos.checkout(branch?.fullRef ?? targetRef);
      if (previousRef && previousRef !== switched) {
        this.undoStack.push({
          kind: 'checkout',
          repoRoot: state.root,
          previousRef,
          targetRef: switched,
          timestamp: Date.now(),
        });
      }
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
      this.undoStack.push({
        kind: 'renameBranch',
        repoRoot: freshState.root,
        fromName: branch.name,
        toName: newName,
        timestamp: Date.now(),
      });
      void vscode.window.setStatusBarMessage(`BranchPilot: Rama renombrada a «${newName}»`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo renombrar «${branch.name}»: ${formatGitFailure(error)}`);
    }
  }

  /** Elimina una rama local previa confirmación y ofrece deshacer la eliminación al instante. */
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
      const deletedSha = await this.repos.deleteBranch(branch.name, !branch.merged);
      this.undoStack.push({
        kind: 'deleteBranch',
        repoRoot: state.root,
        branchName: branch.name,
        targetSha: deletedSha,
        timestamp: Date.now(),
      });
      const undoOpt = 'Deshacer';
      const choice = await vscode.window.showInformationMessage(
        `BranchPilot: Rama «${branch.name}» eliminada (${deletedSha.slice(0, 7)}).`,
        undoOpt,
      );
      if (choice === undoOpt) {
        await this.undoLastBranchAction();
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo eliminar «${branch.name}»: ${formatGitFailure(error)}`);
    }
  }

  /**
   * Deshace la última operación de rama registrada en memoria (`deleteBranch`, `renameBranch`, `checkout`)
   * o permite restaurar desde las últimas entradas de `git reflog` si la pila en memoria está vacía.
   */
  async undoLastBranchAction(): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    const top = this.undoStack.pop(state.root);
    if (top) {
      try {
        switch (top.kind) {
          case 'deleteBranch':
            await this.repos.restoreBranch(top.branchName, top.targetSha);
            void vscode.window.showInformationMessage(
              `BranchPilot: Rama «${top.branchName}» restaurada en ${top.targetSha.slice(0, 7)}.`,
            );
            return;
          case 'renameBranch':
            await this.repos.renameBranch(top.toName, top.fromName);
            void vscode.window.showInformationMessage(
              `BranchPilot: Renombrado revertido a «${top.fromName}».`,
            );
            return;
          case 'checkout':
            await this.repos.checkout(top.previousRef);
            void vscode.window.showInformationMessage(
              `BranchPilot: De vuelta en «${top.previousRef}».`,
            );
            return;
        }
      } catch (error) {
        void vscode.window.showErrorMessage(
          `No se pudo deshacer (${describeUndoEntry(top)}): ${formatGitFailure(error)}`,
        );
        return;
      }
    }

    const reflog = await this.repos.recentReflog(10);
    if (reflog.length === 0) {
      void vscode.window.showInformationMessage('BranchPilot: No hay acciones recientes ni entradas de reflog para deshacer.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      reflog.map((entry) => ({
        label: `${entry.selector} · ${entry.sha.slice(0, 7)}`,
        description: entry.subject,
        entry,
      })),
      {
        title: 'Recuperar estado desde git reflog',
        placeHolder: 'Selecciona un punto del reflog para crear una rama de recuperación desde ese commit',
      },
    );
    if (!picked) return;

    await this.createBranch(picked.entry.sha);
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

  /**
   * Crea una rama para una tarea asistida por IA: pide descripción, sugiere un
   * nombre convencional (`feat/...`, `fix/...`), permite elegir la base y la activa.
   */
  async createTaskBranch(): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    const description = await vscode.window.showInputBox({
      title: 'Crear rama para esta tarea (IA)',
      prompt: 'Describe brevemente la tarea que vas a delegar al agente o implementar',
      placeHolder: 'Ej. Corregir validación de email en formulario de login',
      ignoreFocusOut: true,
    });
    if (!description?.trim()) return;

    const existingLocal = new Set(state.branches.filter((b) => b.kind === 'local').map((b) => b.name));
    const suggested = suggestTaskBranchName(description, existingLocal);

    const chosenBase = await this.pickBaseBranch(state);
    if (!chosenBase) return;

    const rawName = await vscode.window.showInputBox({
      title: `Confirmar nombre de rama (base: ${chosenBase})`,
      prompt: 'Revisa o ajusta el nombre sugerido para la rama de esta tarea',
      value: suggested,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const clean = value.trim();
        const err = validateBranchName(clean);
        if (err) return err;
        if (existingLocal.has(clean)) return `Ya existe una rama local llamada «${clean}».`;
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
      void vscode.window.setStatusBarMessage(`BranchPilot: Lista rama de tarea «${name}»`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo crear la rama de tarea «${name}»: ${formatGitFailure(error)}`);
    }
  }

  /**
   * Mueve en un solo paso los cambios sin guardar del árbol de trabajo actual hacia una nueva
   * rama de tarea a partir de `HEAD` (usado por el Auto-Guard reactivo cuando el agente edita sobre `main`).
   */
  async moveDirtyToTaskBranch(): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    const existingLocal = new Set(state.branches.filter((b) => b.kind === 'local').map((b) => b.name));
    const defaultSuggestion = suggestTaskBranchName('tarea en curso', existingLocal);

    const rawInput = await vscode.window.showInputBox({
      title: `Mover cambios sin guardar a una nueva rama de tarea`,
      prompt: 'Describe la tarea o escribe directamente el nombre de la nueva rama (los cambios actuales se trasladarán a ella)',
      value: defaultSuggestion,
      ignoreFocusOut: true,
      validateInput: (val) => {
        const trimmed = val.trim();
        if (!trimmed) return 'Introduce una descripción o nombre de rama.';
        const candidate = trimmed.includes(' ') ? suggestTaskBranchName(trimmed, existingLocal) : trimmed;
        const err = validateBranchName(candidate);
        if (err) return err;
        if (existingLocal.has(candidate)) return `Ya existe una rama local llamada «${candidate}».`;
        return undefined;
      },
    });
    const trimmed = rawInput?.trim();
    if (!trimmed) return;

    const finalName = trimmed.includes(' ') ? suggestTaskBranchName(trimmed, existingLocal) : trimmed;
    try {
      await this.repos.createBranch(finalName, 'HEAD');
      void vscode.window.showInformationMessage(
        `BranchPilot: Cambios trasladados a la nueva rama de tarea «${finalName}».`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudieron trasladar los cambios a «${finalName}»: ${formatGitFailure(error)}`);
    }
  }

  /**
   * Pre-chequeo interactivo antes de delegar trabajo a un agente de IA:
   * muestra la rama actual y ofrece crear una rama de tarea si se está en una rama protegida o HEAD desacoplado.
   */
  async verifyBranchForTask(): Promise<boolean> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return false;

    const result = evaluateAgentPrecheck({
      head: state.head,
      workingTree: state.workingTree,
      protection: readSettings().protection,
      baseBranch: state.baseBranch,
    });

    const detail = result.details.join('\n');

    if (result.status === 'blocked') {
      void vscode.window.showErrorMessage(`BranchPilot: ${result.headline}`, { modal: true, detail });
      return false;
    }

    if (result.suggestNewTaskBranch) {
      const createOpt = 'Crear rama para esta tarea…';
      const switchOpt = 'Cambiar a otra rama…';
      const continueOpt = `Continuar en «${result.branchLabel}»`;
      const choice = await vscode.window.showWarningMessage(
        result.headline,
        { modal: true, detail },
        createOpt,
        switchOpt,
        continueOpt,
      );
      if (choice === createOpt) {
        await this.createTaskBranch();
        return true;
      }
      if (choice === switchOpt) {
        await this.checkout();
        return true;
      }
      return choice === continueOpt;
    }

    const createOpt = 'Crear nueva rama de tarea…';
    const choice = await vscode.window.showInformationMessage(
      `${result.headline} (${result.details.join(' ')})`,
      createOpt,
    );
    if (choice === createOpt) {
      await this.createTaskBranch();
    }
    return true;
  }

  /**
   * Crea o actualiza las reglas de control de ramas en `AGENTS.md` (o `.clinerules` / `.cursorrules`)
   * para que agentes como Antigravity, Claude Code, Cline o Cursor verifiquen la rama antes de editar.
   */
  async setupAgentRules(): Promise<void> {
    const state = this.requireState();
    if (!state) return;

    const targetPick = await vscode.window.showQuickPick(
      [
        {
          label: 'AGENTS.md',
          description: 'Estándar multi-agente (Antigravity, Claude Code, Codex, OpenCode, Cursor)',
          file: 'AGENTS.md',
        },
        {
          label: '.clinerules',
          description: 'Reglas de workspace para Cline / Roo Code',
          file: '.clinerules',
        },
        {
          label: '.cursorrules',
          description: 'Reglas de workspace para Cursor',
          file: '.cursorrules',
        },
      ],
      {
        title: 'Configurar reglas de rama para agentes de IA',
        placeHolder: 'Elige el archivo donde insertar la regla de verificación de BranchPilot',
      },
    );
    if (!targetPick) return;

    const filePath = path.join(state.root, targetPick.file);
    let existing: string | undefined;
    try {
      existing = await readFile(filePath, 'utf8');
    } catch {
      existing = undefined;
    }

    const updated = upsertAgentRuleInContent(existing, readSettings().protection.protectedBranches);
    try {
      await writeFile(filePath, updated, 'utf8');
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
      void vscode.window.showInformationMessage(
        `BranchPilot: Regla de verificación de rama actualizada en ${targetPick.file}.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo escribir ${targetPick.file}: ${formatGitFailure(error)}`);
    }
  }

  /**
   * Crea un nuevo worktree para trabajar en paralelo (p. ej. con otro agente en otra ventana)
   * sin cambiar ni alterar la rama activa en la ventana actual.
   */
  async createWorktree(branchRefOrName?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let newBranch: string | undefined;
    let refOrBase: string | undefined;
    let slugForFolder: string;

    if (branchRefOrName) {
      const found = state.branches.find((b) => b.fullRef === branchRefOrName || b.name === branchRefOrName);
      const branchName = found ? found.name : branchRefOrName.replace(/^refs\/(heads|remotes)\//, '');
      const busy = state.worktrees.find((w) => w.branch === branchName);
      if (busy) {
        const openOpt = 'Abrir en nueva ventana';
        const pick = await vscode.window.showInformationMessage(
          `La rama «${branchName}» ya tiene un worktree en «${busy.path}».`,
          openOpt,
        );
        if (pick === openOpt) await this.openWorktree(busy.path);
        return;
      }
      refOrBase = branchName;
      slugForFolder = branchName.replace(/[^a-zA-Z0-9._-]+/g, '-');
    } else {
      const modePick = await vscode.window.showQuickPick(
        [
          {
            label: '$(sparkle) Nueva rama de tarea en worktree paralelo',
            description: 'Ideal para lanzar un segundo agente en otra ventana sin tocar esta rama',
            mode: 'new' as const,
          },
          {
            label: '$(git-branch) Rama existente en worktree paralelo',
            description: 'Abre una rama local que no esté en uso en una carpeta hermana',
            mode: 'existing' as const,
          },
        ],
        {
          title: 'Crear worktree paralelo',
          placeHolder: '¿Quieres crear una rama nueva o usar una existente?',
        },
      );
      if (!modePick) return;

      if (modePick.mode === 'existing') {
        const usedBranches = new Set(state.worktrees.map((w) => w.branch).filter(Boolean));
        const available = state.branches.filter((b) => b.kind === 'local' && !usedBranches.has(b.name));
        const picked = await this.pickBranch(available, 'Selecciona la rama local para el nuevo worktree');
        if (!picked) return;
        refOrBase = picked.name;
        slugForFolder = picked.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      } else {
        const chosenBase = await this.pickBaseBranch(state);
        if (!chosenBase) return;
        const existingLocal = new Set(state.branches.filter((b) => b.kind === 'local').map((b) => b.name));
        const rawName = await vscode.window.showInputBox({
          title: `Nueva rama para worktree (base: ${chosenBase})`,
          prompt: 'Introduce el nombre de la nueva rama o descripción corta',
          placeHolder: 'feat/agente-paralelo',
          ignoreFocusOut: true,
          validateInput: (val) => {
            const clean = val.trim();
            const err = validateBranchName(clean);
            if (err) return err;
            if (existingLocal.has(clean)) return `Ya existe una rama local llamada «${clean}».`;
            return undefined;
          },
        });
        const cleanName = rawName?.trim();
        if (!cleanName) return;
        newBranch = cleanName;
        refOrBase = chosenBase;
        slugForFolder = cleanName.replace(/[^a-zA-Z0-9._-]+/g, '-');
      }
    }

    const defaultDir = path.join(path.dirname(state.root), `${state.name}-${slugForFolder}`);
    const targetInput = await vscode.window.showInputBox({
      title: 'Carpeta destino del worktree',
      prompt: 'Ruta donde se creará el árbol de trabajo paralelo',
      value: defaultDir,
      ignoreFocusOut: true,
      validateInput: (val) => (!val.trim() ? 'La ruta no puede estar vacía.' : undefined),
    });
    const targetDir = targetInput?.trim();
    if (!targetDir) return;

    try {
      const createdPath = await this.repos.addWorktree(targetDir, { newBranch, refOrBase });
      const settings = readSettings();
      const boot = await bootstrapWorktree(state.root, createdPath, {
        copyFiles: settings.worktreeCopyFiles,
        linkNodeModules: settings.worktreeLinkNodeModules,
      });
      const extras: string[] = [];
      if (boot.copiedFiles.length > 0) extras.push(`copiados: ${boot.copiedFiles.join(', ')}`);
      if (boot.linkedNodeModules) extras.push('node_modules enlazado');
      if (boot.skippedSymlinkForMonorepo) extras.push('monorepo pnpm detectado');
      const extraText = extras.length > 0 ? ` (${extras.join(' · ')})` : '';

      const openOpt = 'Abrir en nueva ventana';
      const installCmd = boot.skippedSymlinkForMonorepo ? boot.packageManager.installCommand : undefined;
      const installAndOpenOpt = installCmd ? `Instalar (${installCmd.display}) y abrir` : undefined;
      const buttons = installAndOpenOpt ? [installAndOpenOpt, openOpt] : [openOpt];

      const choice = await vscode.window.showInformationMessage(
        `BranchPilot: Worktree creado en «${createdPath}»${extraText}.`,
        ...buttons,
      );
      if (choice === installAndOpenOpt && installCmd) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `BranchPilot: Ejecutando ${installCmd.display} en worktree…`,
          },
          async () => {
            await runPackageInstall(createdPath, installCmd);
          },
        );
        await this.openWorktree(createdPath);
      } else if (choice === openOpt) {
        await this.openWorktree(createdPath);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo crear el worktree: ${formatGitFailure(error)}`);
    }
  }

  /** Abre la carpeta de un worktree en una nueva ventana del IDE. */
  async openWorktree(worktreePath?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let targetPath = worktreePath;
    if (!targetPath) {
      const others = state.worktrees.filter((w) => !w.isCurrent);
      if (others.length === 0) {
        void vscode.window.showInformationMessage('BranchPilot: No hay otros worktrees creados para este repositorio.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        others.map((w) => ({
          label: w.branch ?? `HEAD (${w.head})`,
          description: w.path,
          path: w.path,
        })),
        { placeHolder: 'Selecciona el worktree que deseas abrir en una nueva ventana' },
      );
      if (!picked) return;
      targetPath = picked.path;
    }

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
  }

  /** Quita un worktree secundario previa confirmación del usuario. */
  async removeWorktree(worktreePath?: string): Promise<void> {
    await this.repos.refresh();
    const state = this.requireState();
    if (!state) return;

    let target = worktreePath ? state.worktrees.find((w) => w.path === worktreePath) : undefined;
    if (!target) {
      const removable = state.worktrees.filter((w) => !w.isCurrent && !w.isMain);
      if (removable.length === 0) {
        void vscode.window.showInformationMessage('BranchPilot: No hay worktrees secundarios para quitar.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        removable.map((w) => ({
          label: w.branch ?? `HEAD (${w.head})`,
          description: w.path,
          wt: w,
        })),
        { placeHolder: 'Selecciona el worktree secundario que deseas quitar' },
      );
      if (!picked) return;
      target = picked.wt;
    }

    if (target.isCurrent || target.isMain) {
      void vscode.window.showErrorMessage('BranchPilot: No se puede quitar el worktree principal ni el activo en esta ventana.');
      return;
    }

    const confirmOpt = 'Quitar worktree';
    const forceOpt = 'Forzar eliminación';
    const choice = await vscode.window.showWarningMessage(
      `¿Quitar el worktree «${target.path}» (${target.branch ?? target.head})?`,
      {
        modal: true,
        detail: 'Se eliminará la carpeta del árbol de trabajo secundario (la rama y sus commits se conservan en el repositorio).',
      },
      confirmOpt,
      forceOpt,
    );
    if (choice !== confirmOpt && choice !== forceOpt) return;

    try {
      await this.repos.removeWorktree(target.path, choice === forceOpt);
      void vscode.window.setStatusBarMessage(`BranchPilot: Worktree «${target.path}» eliminado`, 4000);
    } catch (error) {
      void vscode.window.showErrorMessage(`No se pudo quitar el worktree: ${formatGitFailure(error)}`);
    }
  }

  /** Muestra un diagnóstico completo de compatibilidad del IDE y versión de Git. */
  async diagnoseEnvironment(): Promise<void> {
    const cwd = this.repos.state?.root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const gitVersion = await probeGitVersion(cwd);
    const hasVscodeGitExtension = vscode.extensions.getExtension('vscode.git') !== undefined;

    const report = buildCompatibilityReport({
      appName: vscode.env.appName,
      uriScheme: vscode.env.uriScheme,
      vscodeVersion: vscode.version,
      hasVscodeGitExtension,
      gitVersion,
    });

    const detail = [
      `IDE detectado: ${report.appName} (familia: ${report.ideFamily})`,
      `Motor VS Code: ${report.vscodeVersion}`,
      `Versión de Git: ${report.gitVersion?.raw ?? 'No detectado'}`,
      '',
      ...report.notes,
    ].join('\n');

    void vscode.window.showInformationMessage(
      `BranchPilot — Diagnóstico de compatibilidad (${report.ideFamily})`,
      { modal: true, detail },
    );
  }

  /** Permite elegir cuál de los repositorios descubiertos en el workspace inspeccionar. */
  async switchRepository(root?: string): Promise<void> {
    if (root) {
      await this.repos.selectRepository(root);
      return;
    }
    await this.repos.refresh();
    const list = this.repos.repositories;
    if (list.length === 0) {
      void vscode.window.showWarningMessage('BranchPilot: No se detectaron repositorios Git en el workspace.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      list.map((r) => {
        const branchLabel = r.detached ? `HEAD (${r.shortHash ?? 'desacoplado'})` : (r.branch ?? 'HEAD');
        const statusParts = [
          `${r.localBranches} locales`,
          r.unmergedLocalBranches > 0 ? `${r.unmergedLocalBranches} sin fusionar` : 'todo fusionado',
          r.staleLocalBranches > 0 ? `${r.staleLocalBranches} antiguas` : undefined,
          r.dirty ? `${r.changesCount} cambios` : 'limpio',
        ].filter(Boolean);
        return {
          label: `${r.isActive ? '$(check) ' : ''}${r.name}`,
          description: `Rama: ${branchLabel}`,
          detail: `${statusParts.join(' · ')} — ${r.root}`,
          root: r.root,
        };
      }),
      {
        title: 'Repositorios Git del workspace',
        placeHolder: 'Selecciona el repositorio activo para BranchPilot',
      },
    );
    if (picked) {
      await this.repos.selectRepository(picked.root);
    }
  }

  /** Abre cualquiera de los repositorios descubiertos en una nueva ventana del IDE. */
  async openRepositoryInWindow(root?: string): Promise<void> {
    let targetRoot = root;
    if (!targetRoot) {
      await this.repos.refresh();
      const list = this.repos.repositories;
      if (list.length === 0) {
        void vscode.window.showWarningMessage('BranchPilot: No se detectaron repositorios Git.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        list.map((r) => {
          const branchLabel = r.detached ? `HEAD (${r.shortHash ?? 'desacoplado'})` : (r.branch ?? 'HEAD');
          const statusParts = [
            r.dirty ? `${r.changesCount} cambios sin guardar` : 'limpio',
            r.unmergedLocalBranches > 0 ? `${r.unmergedLocalBranches} sin fusionar` : 'todo fusionado',
            r.worktreesCount > 1 ? `${r.worktreesCount} worktrees` : undefined,
          ].filter(Boolean);
          return {
            label: `${r.dirty || r.unmergedLocalBranches > 0 ? '$(flame) ' : '$(repo) '}${r.name}`,
            description: `Rama: ${branchLabel}`,
            detail: `${statusParts.join(' · ')} — ${r.root}`,
            root: r.root,
          };
        }),
        {
          title: 'Abrir repositorio en nueva ventana',
          placeHolder: 'Selecciona el repositorio que deseas abrir en una ventana independiente',
        },
      );
      if (!picked) return;
      targetRoot = picked.root;
    }

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetRoot), true);
  }

  openSourceControl(): void {
    void vscode.commands.executeCommand('workbench.view.scm');
  }

  async quickCommit(message: string): Promise<void> {
    const state = this.requireState();
    if (!state) return;
    const cleanMsg = message.trim();
    if (!cleanMsg) {
      void vscode.window.showWarningMessage('BranchPilot: El mensaje de commit no puede estar vacío.');
      return;
    }
    if (!state.head.detached && state.head.branch) {
      const branchName = state.head.branch;
      const settings = readSettings();
      if (isListedProtected(branchName, settings.protection.protectedBranches)) {
        const choice = await vscode.window.showWarningMessage(
          `BranchPilot: Estás a punto de hacer un commit directamente en la rama protegida «${branchName}».`,
          {
            modal: true,
            detail: 'Para mantener la estabilidad del proyecto, se recomienda trasladar los cambios a una rama de tarea aislada.',
          },
          'Mover a rama de tarea',
          `Hacer commit en ${branchName}`,
        );
        if (choice === 'Mover a rama de tarea') {
          await this.moveDirtyToTaskBranch();
          return;
        }
        if (choice !== `Hacer commit en ${branchName}`) {
          return;
        }
      }
    }
    try {
      const sha = await this.repos.quickCommit(cleanMsg);
      const shortSha = sha.slice(0, 7);
      void vscode.window.showInformationMessage(`BranchPilot: Commit ${shortSha} creado con éxito.`);
    } catch (err) {
      void vscode.window.showErrorMessage(`BranchPilot: No se pudo crear el commit — ${formatGitFailure(err)}`);
    }
  }
}



