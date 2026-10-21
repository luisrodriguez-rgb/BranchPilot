import * as vscode from 'vscode';
import {
  BranchActions,
  CHECKOUT_COMMAND,
  CREATE_BRANCH_COMMAND,
  CREATE_TASK_BRANCH_COMMAND,
  CREATE_WORKTREE_COMMAND,
  DELETE_BRANCH_COMMAND,
  OPEN_WORKTREE_COMMAND,
  REMOVE_WORKTREE_COMMAND,
  RENAME_BRANCH_COMMAND,
  SETUP_AGENT_RULES_COMMAND,
  VERIFY_TASK_BRANCH_COMMAND,
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
    vscode.commands.registerCommand(CREATE_TASK_BRANCH_COMMAND, () => actions.createTaskBranch()),
    vscode.commands.registerCommand(VERIFY_TASK_BRANCH_COMMAND, () => actions.verifyBranchForTask()),
    vscode.commands.registerCommand(SETUP_AGENT_RULES_COMMAND, () => actions.setupAgentRules()),
    vscode.commands.registerCommand(CREATE_WORKTREE_COMMAND, (ref?: string) => actions.createWorktree(ref)),
    vscode.commands.registerCommand(OPEN_WORKTREE_COMMAND, (wtPath?: string) => actions.openWorktree(wtPath)),
    vscode.commands.registerCommand(REMOVE_WORKTREE_COMMAND, (wtPath?: string) => actions.removeWorktree(wtPath)),
  );

  await repos.start();
}

export function deactivate(): void {
  // los recursos se liberan mediante context.subscriptions
}



