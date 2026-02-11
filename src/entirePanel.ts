import * as vscode from "vscode";
import * as crypto from "crypto";
import { DataProvider } from "./dataProvider";
import { execGit } from "./gitReader";
import type { WebviewMessage, HostMessage } from "./types";

const POLL_INTERVAL_MS = 30_000;

export class EntirePanel {
  public static currentPanel: EntirePanel | undefined;
  private static readonly viewType = "entireGraph";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly dataProvider: DataProvider;
  private readonly workspaceRoot: string;
  private disposables: vscode.Disposable[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private lastCheckpointHead: string | undefined;

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (EntirePanel.currentPanel) {
      EntirePanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      EntirePanel.viewType,
      "Entire Graph",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist"),
        ],
      }
    );

    EntirePanel.currentPanel = new EntirePanel(panel, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.extensionUri = context.extensionUri;

    this.workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    this.dataProvider = new DataProvider(this.workspaceRoot);

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.setupFileWatcher();
    this.startPolling();
    this.loadInitialData();
  }

  private async loadInitialData() {
    try {
      const [commits, activeSessions] = await Promise.all([
        this.dataProvider.getCommits(),
        this.dataProvider.getActiveSessions(),
      ]);
      this.postMessage({ type: "initialData", commits, activeSessions });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: "error", message });
    }
  }

  private async handleMessage(msg: WebviewMessage) {
    switch (msg.type) {
      case "requestDetail": {
        try {
          const detail = await this.dataProvider.getCommitDetail(msg.hash);
          this.postMessage({ type: "commitDetail", detail });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.postMessage({ type: "error", message });
        }
        break;
      }
      case "refresh": {
        await this.loadInitialData();
        break;
      }
    }
  }

  /** Watch .git/entire-sessions/ for changes to active sessions. */
  private setupFileWatcher() {
    const pattern = new vscode.RelativePattern(
      this.workspaceRoot,
      ".git/entire-sessions/*.json"
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const refreshSessions = async () => {
      try {
        const sessions = await this.dataProvider.getActiveSessions();
        this.postMessage({ type: "activeSessions", sessions });
      } catch {
        // ignore
      }
    };

    watcher.onDidCreate(refreshSessions, null, this.disposables);
    watcher.onDidChange(refreshSessions, null, this.disposables);
    watcher.onDidDelete(refreshSessions, null, this.disposables);
    this.disposables.push(watcher);
  }

  /** Poll for changes to entire/checkpoints/v1 HEAD. */
  private startPolling() {
    this.pollTimer = setInterval(async () => {
      try {
        const head = await execGit(
          ["rev-parse", "entire/checkpoints/v1"],
          this.workspaceRoot
        );
        const trimmed = head.trim();
        if (this.lastCheckpointHead && trimmed !== this.lastCheckpointHead) {
          await this.loadInitialData();
        }
        this.lastCheckpointHead = trimmed;
      } catch {
        // Branch may not exist
      }
    }, POLL_INTERVAL_MS);
  }

  private postMessage(msg: HostMessage) {
    this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    const nonce = crypto.randomBytes(16).toString("hex");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>Entire Graph</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose() {
    EntirePanel.currentPanel = undefined;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
