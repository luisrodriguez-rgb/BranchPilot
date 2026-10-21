import * as vscode from 'vscode';
import { RepoService } from './repoService';
import { BranchPanelProvider } from './ui/branchPanel/provider';
import { BranchStatusBar, FOCUS_PANEL_COMMAND } from './ui/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const repos = new RepoService();
  const statusBar = new BranchStatusBar(repos);
  const panel = new BranchPanelProvider(context.extensionUri, repos);

  context.subscriptions.push(
    repos,
    statusBar,
    panel,
    vscode.window.registerWebviewViewProvider(BranchPanelProvider.viewType, panel),
    vscode.commands.registerCommand('branchpilot.refresh', () => repos.refresh()),
    vscode.commands.registerCommand(FOCUS_PANEL_COMMAND, () =>
      vscode.commands.executeCommand('workbench.view.extension.branchpilot'),
    ),
  );

  await repos.start();
}

export function deactivate(): void {
  // los recursos se liberan mediante context.subscriptions
}
