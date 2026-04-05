import * as vscode from "vscode";
import * as path from "path";
import { DuckDBProvider } from "./duckdbProvider";

interface WebviewMessage {
  type: string;
  table?: string;
  page?: number;
  sql?: string;
}

export class DuckDBViewerPanel {
  static readonly viewType = "duckdbViewer";
  private static panels = new Map<string, DuckDBViewerPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly provider: DuckDBProvider;
  private readonly extensionUri: vscode.Uri;
  private readonly filePath: string;
  private readonly disposables: vscode.Disposable[] = [];

  static async createOrShow(
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri
  ): Promise<void> {
    const filePath = fileUri.fsPath;
    const fileName = path.basename(filePath);

    const existing = DuckDBViewerPanel.panels.get(filePath);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DuckDBViewerPanel.viewType,
      `DuckDB: ${fileName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "src", "webview"),
        ],
      }
    );

    const viewer = new DuckDBViewerPanel(
      panel,
      context.extensionUri,
      filePath
    );
    DuckDBViewerPanel.panels.set(filePath, viewer);
    context.subscriptions.push({ dispose: () => viewer.dispose() });

    await viewer.initialize();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    filePath: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.filePath = filePath;
    this.provider = new DuckDBProvider(filePath);

    this.panel.webview.html = this.getHtml();
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, "icon.svg");

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async initialize(): Promise<void> {
    try {
      await this.provider.connect();
      const tables = await this.provider.getTables();
      await this.panel.webview.postMessage({ type: "tablesLoaded", tables });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: "error", message });
    }
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    try {
      switch (msg.type) {
        case "getTables": {
          const tables = await this.provider.getTables();
          await this.panel.webview.postMessage({
            type: "tablesLoaded",
            tables,
          });
          break;
        }
        case "selectTable": {
          const result = await this.provider.getTableData(
            msg.table!,
            msg.page ?? 0
          );
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
            table: msg.table,
            page: msg.page ?? 0,
          });
          break;
        }
        case "runQuery": {
          const result = await this.provider.runQuery(msg.sql!);
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
          });
          break;
        }
        case "refresh": {
          await this.provider.reconnect();
          const tables = await this.provider.getTables();
          await this.panel.webview.postMessage({
            type: "tablesLoaded",
            tables,
          });
          break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: "error", message });
    }
  }

  private getHtml(): string {
    const wv = this.panel.webview;
    const styleUri = wv.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "webview", "style.css")
    );
    const scriptUri = wv.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "webview", "main.js")
    );
    const nonce = getNonce();
    const fileName = path.basename(this.filePath);

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${wv.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>DuckDB: ${esc(fileName)}</title>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Tables</span>
        <button class="icon-btn" id="refresh-btn" title="Refresh (reconnect &amp; reload tables)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M4.681 3.094A5.003 5.003 0 0 1 13 8h-1a4.002 4.002 0 0 0-6.654-2.985L7 6.5H3V2.5l1.681.594zM3 8a4.003 4.003 0 0 0 6.654 2.985L8 9.5h4V13.5l-1.681-.594A5.003 5.003 0 0 1 3 8z"/>
          </svg>
        </button>
      </div>
      <ul class="table-list" id="table-list"></ul>
      <div class="sidebar-footer">
        <span class="db-name" title="${esc(this.filePath)}">${esc(fileName)}</span>
      </div>
    </aside>

    <main class="main">
      <div class="query-bar">
        <div class="query-input-wrapper">
          <textarea
            id="query-input"
            placeholder="Write SQL and press ${process.platform === "darwin" ? "Cmd" : "Ctrl"}+Enter to run..."
            rows="3"
            spellcheck="false"
          ></textarea>
        </div>
        <div class="query-actions">
          <button class="btn btn-primary" id="run-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2l10 6-10 6V2z"/>
            </svg>
            Run
          </button>
          <button class="btn btn-secondary" id="csv-btn" title="Copy results as CSV" disabled>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 2h12v3H2V2zm0 4h5v4H2V6zm6 0h6v4H8V6zM2 11h5v3H2v-3zm6 0h6v3H8v-3z"/>
            </svg>
            CSV
          </button>
        </div>
      </div>

      <div class="status-bar" id="status-bar"></div>

      <div class="result-area" id="result-area">
        <div class="empty-state" id="empty-state">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" opacity="0.2">
            <path d="M24 4C12.954 4 4 8.477 4 14v20c0 5.523 8.954 10 20 10s20-4.477 20-10V14c0-5.523-8.954-10-20-10zm16 10c0 2.418-6.611 6-16 6S8 16.418 8 14s6.611-6 16-6 16 3.582 16 6zM8 19.37C10.924 21.627 17.035 23 24 23s13.076-1.373 16-3.63V24c0 2.418-6.611 6-16 6S8 26.418 8 24v-4.63zM24 40c-9.389 0-16-3.582-16-6v-4.63C10.924 31.627 17.035 33 24 33s13.076-1.373 16-3.63V34c0 2.418-6.611 6-16 6z"/>
          </svg>
          <p>Select a table or run a query</p>
        </div>
        <div class="grid-wrapper" id="grid-wrapper" style="display:none">
          <div class="grid-container" id="grid-container">
            <table class="data-grid" id="data-grid"></table>
          </div>
        </div>
        <div class="error-banner" id="error-banner" style="display:none"></div>
      </div>

      <div class="pagination" id="pagination" style="display:none"></div>
    </main>
  </div>

  <div class="loading-overlay" id="loading" style="display:none">
    <div class="spinner"></div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    DuckDBViewerPanel.panels.delete(this.filePath);
    this.provider.dispose();
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
