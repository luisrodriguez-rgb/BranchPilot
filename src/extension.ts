import * as vscode from 'vscode';
import {
  BranchActions,
  CHECKOUT_COMMAND,
  CREATE_BRANCH_COMMAND,
  DELETE_BRANCH_COMMAND,
  RENAME_BRANCH_COMMAND,
} from './branchActions';
import { RepoService } from './repoService';
import { BranchPanelProvider } from './ui/branchPanel/provider';
import { BranchStatusBar, FOCUS_PANEL_COMMAND } from './ui/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const repos = new RepoService();
  const actions = new BranchActions(repos);
  const statusBar = new BranchStatusBar(repos);
  const panel = new BranchPanelProvider(context.extensionUri, repos, actions);

  context.subscriptions.push(
    repos,
    statusBar,
    panel,
    vscode.window.registerWebviewViewProvider(BranchPanelProvider.viewType, panel),
    vscode.commands.registerCommand('branchpilot.refresh', () => repos.refresh()),
    vscode.commands.registerCommand(FOCUS_PANEL_COMMAND, () =>
      vscode.commands.executeCommand('workbench.view.extension.branchpilot'),
    ),
    vscode.commands.registerCommand(CHECKOUT_COMMAND, (ref?: string) => actions.checkout(ref)),
    vscode.commands.registerCommand(CREATE_BRANCH_COMMAND, (base?: string) => actions.createBranch(base)),
    vscode.commands.registerCommand(RENAME_BRANCH_COMMAND, (ref?: string) => actions.renameBranch(ref)),
    vscode.commands.registerCommand(DELETE_BRANCH_COMMAND, (ref?: string) => actions.deleteBranch(ref)),
  );

  await repos.start();
}

export function deactivate(): void {
  // los recursos se liberan mediante context.subscriptions
}

