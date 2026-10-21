import * as vscode from 'vscode';
import type { BranchActions } from '../branchActions';
import { evaluateProtectedBranchEditAlert } from '../guards/autoGuard';
import type { RepoService } from '../repoService';
import { readSettings } from '../settings';
import { isListedProtected } from '../shared/protection';
import { isDirty } from '../shared/types';
import type { RepoState } from '../shared/types';

/**
 * Observa transiciones de limpio a sucio mientras el usuario o un agente de IA
 * edita archivos sobre una rama protegida (`main`, `master`, etc.) y ofrece
 * mover los cambios sin guardar a una nueva rama de tarea con un clic.
 */
export class AutoGuardWatcher implements vscode.Disposable {
  private previousState: RepoState | undefined;
  private readonly dismissedRoots = new Set<string>();
  private activeNotification = false;
  private editRefreshTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly repos: RepoService,
    private readonly actions: BranchActions,
  ) {
    this.previousState = repos.state;

    this.subscriptions.push(
      repos.onDidChange(() => {
        void this.onRepoStateChanged();
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        this.scheduleProtectedCheck();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme === 'file' && event.contentChanges.length > 0) {
          this.scheduleProtectedCheck();
        }
      }),
    );
  }

  private scheduleProtectedCheck(): void {
    const state = this.repos.state;
    if (!state || state.head.detached || !state.head.branch) return;
    const settings = readSettings();
    if (!settings.autoGuardEnabled || settings.protection.mode === 'off') return;
    const isProtected =
      isListedProtected(state.head.branch, settings.protection.protectedBranches) ||
      (state.baseBranch !== undefined && state.head.branch === state.baseBranch);
    if (!isProtected || isDirty(state.workingTree)) return;

    if (this.editRefreshTimer) clearTimeout(this.editRefreshTimer);
    this.editRefreshTimer = setTimeout(() => {
      this.editRefreshTimer = undefined;
      void this.repos.refresh();
    }, 900);
  }

  private async onRepoStateChanged(): Promise<void> {
    const current = this.repos.state;
    const previous = this.previousState;
    this.previousState = current;

    if (current && !current.head.detached && current.head.branch && !isDirty(current.workingTree)) {
      this.dismissedRoots.delete(`${current.root}@${current.head.branch}`);
    }

    const settings = readSettings();
    if (!settings.autoGuardEnabled) return;

    const alert = evaluateProtectedBranchEditAlert({
      previous,
      current,
      protection: settings.protection,
      dismissedRoots: this.dismissedRoots,
    });

    if (!alert || this.activeNotification) return;

    this.activeNotification = true;
    const moveAction = 'Mover cambios a rama de tarea…';
    const ignoreAction = 'Ignorar en esta sesión';
    try {
      const choice = await vscode.window.showWarningMessage(
        `BranchPilot: ${alert.message}`,
        moveAction,
        ignoreAction,
      );
      if (choice === moveAction) {
        await this.actions.moveDirtyToTaskBranch();
      } else if (choice === ignoreAction) {
        this.dismissedRoots.add(`${alert.root}@${alert.branch}`);
      }
    } finally {
      this.activeNotification = false;
    }
  }

  dispose(): void {
    if (this.editRefreshTimer) clearTimeout(this.editRefreshTimer);
    for (const s of this.subscriptions) s.dispose();
  }
}
