import * as vscode from 'vscode';
import type { BranchActions } from '../../branchActions';
import type { RepoService } from '../../repoService';
import { readSettings } from '../../settings';
import { isFromWebview } from '../../shared/messages';
import type { PanelState, ToWebview } from '../../shared/messages';
import { randomBytes } from 'node:crypto';

export class BranchPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'branchpilot.panel';

  private view: vscode.WebviewView | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repos: RepoService,
    private readonly actions: BranchActions,
  ) {
    this.subscriptions.push(
      repos.onDidChange(() => this.push()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('branchpilot')) this.push();
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((message: unknown) => {
      if (!isFromWebview(message)) return;
      switch (message.type) {
        case 'ready':
          this.push();
          break;
        case 'refresh':
          void this.repos.refresh();
          break;
        case 'requestCommits':
          void this.sendCommits(message.ref);
          break;
        case 'checkout':
          void this.actions.checkout(message.ref);
          break;
        case 'createBranch':
          void this.actions.createBranch(message.base);
          break;
        case 'renameBranch':
          void this.actions.renameBranch(message.ref);
          break;
        case 'deleteBranch':
          void this.actions.deleteBranch(message.ref);
          break;
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.push();
        void this.repos.refresh();
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  private currentState(): PanelState {
    const repo = this.repos.state;
    if (!repo) return { kind: 'empty' };
    const settings = readSettings();
    return { kind: 'repo', repo, protection: settings.protection, staleDays: settings.staleDays };
  }

  private async sendCommits(ref: string): Promise<void> {
    const known = this.repos.state?.branches.some((b) => b.fullRef === ref);
    let message: ToWebview;
    try {
      if (!known) throw new Error('La rama ya no existe.');
      message = { type: 'commits', ref, commits: await this.repos.recentCommits(ref) };
    } catch (error) {
      message = { type: 'commits', ref, commits: [], error: error instanceof Error ? error.message : String(error) };
    }
    void this.view?.webview.postMessage(message);
  }

  private push(): void {
    if (!this.view) return;
    const message: ToWebview = { type: 'state', state: this.currentState() };
    void this.view.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
  <title>BranchPilot</title>
</head>
<body>
  <div id="app" aria-live="polite"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    for (const s of this.subscriptions) s.dispose();
  }
}
