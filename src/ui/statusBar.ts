import * as vscode from 'vscode';
import type { RepoService } from '../repoService';
import { readSettings } from '../settings';
import { buildStatusBarModel } from '../shared/statusBarModel';
import type { RepoState } from '../shared/types';

export const FOCUS_PANEL_COMMAND = 'branchpilot.focusPanel';

export class BranchStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: vscode.Disposable;
  private readonly configSubscription: vscode.Disposable;

  constructor(private readonly repos: RepoService) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    this.item.name = 'BranchPilot';
    this.item.command = FOCUS_PANEL_COMMAND;
    this.subscription = repos.onDidChange((state) => this.render(state));
    this.configSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('branchpilot')) this.render(this.repos.state);
    });
    this.render(repos.state);
  }

  private render(state: RepoState | undefined): void {
    if (!state) {
      this.item.hide();
      return;
    }
    const model = buildStatusBarModel(state, readSettings().protection);
    this.item.text = model.text;
    this.item.backgroundColor = model.warning ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.item.accessibilityInformation = {
      label: model.tooltipLines.join(' '),
      role: 'button',
    };
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**BranchPilot** — ${state.name}\n\n`);
    for (const line of model.tooltipLines) tooltip.appendText(`${line}\n\n`);
    tooltip.appendMarkdown('_Clic para abrir el panel de ramas_');
    this.item.tooltip = tooltip;
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.configSubscription.dispose();
    this.item.dispose();
  }
}
