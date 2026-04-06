import * as vscode from "vscode";
import * as path from "path";
import { DuckDBProvider } from "./duckdbProvider";
import type { ExtensionMessage, SortDir } from "./shared/types";

const HISTORY_KEY = "duckdb-viewer.queryHistory";
const MAX_HISTORY = 50;

export class DuckDBViewerPanel {
  static readonly viewType = "duckdbViewer";
  private static panels = new Map<string, DuckDBViewerPanel>();

  private readonly panel: vscode.WebviewPanel;
  private readonly provider: DuckDBProvider;
  private readonly extensionUri: vscode.Uri;
  private readonly context: vscode.ExtensionContext;
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
          vscode.Uri.joinPath(context.extensionUri, "dist"),
          vscode.Uri.joinPath(context.extensionUri, "src", "webview"),
        ],
      }
    );

    await DuckDBViewerPanel.initWithPanel(panel, context, fileUri);
  }

  static async initWithPanel(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri
  ): Promise<DuckDBViewerPanel> {
    const filePath = fileUri.fsPath;
    DuckDBViewerPanel.panels.get(filePath)?.dispose();
    const viewer = new DuckDBViewerPanel(panel, context, filePath);
    DuckDBViewerPanel.panels.set(filePath, viewer);
    await viewer.initialize();
    return viewer;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    filePath: string
  ) {
    this.panel = panel;
    this.context = context;
    this.extensionUri = context.extensionUri;
    this.filePath = filePath;
    this.provider = new DuckDBProvider(filePath);

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg: ExtensionMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async initialize(): Promise<void> {
    try {
      await this.provider.connect();
      const schema = await this.provider.getSchema();
      await this.panel.webview.postMessage({ type: "schemaLoaded", schema });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: "error", message });
    }
  }

  private async handleMessage(msg: ExtensionMessage): Promise<void> {
    try {
      switch (msg.type) {
        case "getSchema":
        case "refresh": {
          if (msg.type === "refresh") await this.provider.reconnect();
          const schema = await this.provider.getSchema();
          await this.panel.webview.postMessage({
            type: "schemaLoaded",
            schema,
          });
          break;
        }
        case "selectTable": {
          const result = await this.provider.getTableData(
            msg.table!,
            msg.page ?? 0,
            msg.sortColumn,
            msg.sortDir as SortDir | undefined
          );
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
            table: msg.table,
            page: msg.page ?? 0,
            sortColumn: msg.sortColumn,
            sortDir: msg.sortDir,
          });
          break;
        }
        case "runQuery": {
          this.addToHistory(msg.sql!);
          const result = await this.provider.runQuery(msg.sql!);
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
          });
          break;
        }
        case "summarize": {
          const result = await this.provider.runQuery(
            `SUMMARIZE "${msg.table!}"`
          );
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
          });
          break;
        }
        case "describeTable": {
          const result = await this.provider.runQuery(
            `DESCRIBE "${msg.table!}"`
          );
          await this.panel.webview.postMessage({
            type: "queryResult",
            ...result,
          });
          break;
        }
        case "exportToFile": {
          const format = msg.format as "csv" | "parquet" | "json";
          const filterMap: Record<string, Record<string, string[]>> = {
            csv: { "CSV Files": ["csv"] },
            parquet: { "Parquet Files": ["parquet"] },
            json: { "JSON Files": ["json"] },
          };
          const saveUri = await vscode.window.showSaveDialog({
            filters: filterMap[format],
            defaultUri: vscode.Uri.file(
              this.filePath.replace(/\.[^.]+$/, `_export.${format}`)
            ),
          });
          if (!saveUri) break;
          const escaped = saveUri.fsPath.replace(/'/g, "''");
          await this.provider.runQuery(
            `COPY (${msg.sql}) TO '${escaped}' (FORMAT '${format}')`
          );
          await this.panel.webview.postMessage({
            type: "exportComplete",
            path: saveUri.fsPath,
          });
          break;
        }
        case "getHistory": {
          const history = this.context.globalState.get<string[]>(
            HISTORY_KEY,
            []
          );
          await this.panel.webview.postMessage({
            type: "historyLoaded",
            history,
          });
          break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: "error", message });
    }
  }

  private addToHistory(sql: string): void {
    const history = this.context.globalState.get<string[]>(HISTORY_KEY, []);
    const filtered = history.filter((q) => q !== sql);
    filtered.unshift(sql);
    if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
    this.context.globalState.update(HISTORY_KEY, filtered);
  }

  private getHtml(): string {
    const wv = this.panel.webview;
    const styleUri = wv.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "webview", "style.css")
    );
    const scriptUri = wv.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const nonce = getNonce();
    const fileName = path.basename(this.filePath);

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${wv.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>DuckDB: ${esc(fileName)}</title>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Schema</span>
        <button class="icon-btn" id="refresh-btn" title="Refresh (reconnect &amp; reload)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
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
        <div class="query-editor-wrapper">
          <div id="query-editor"></div>
        </div>
        <div class="query-actions">
          <button class="btn btn-primary" id="run-btn" title="${process.platform === "darwin" ? "Cmd" : "Ctrl"}+Enter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            Run
          </button>
          <button class="icon-btn" id="more-btn" title="More actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          <div class="actions-dropdown" id="actions-dropdown" style="display:none">
            <button class="dropdown-item" id="csv-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>
              </svg>
              Copy as CSV
            </button>
            <button class="dropdown-item" id="json-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>
              </svg>
              Copy as JSON
            </button>
            <button class="dropdown-item" id="profile-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h.01"/><path d="M11 12h.01"/><path d="M15 8h.01"/><path d="M19 4h.01"/>
              </svg>
              Profile table
            </button>
            <div class="dropdown-separator"></div>
            <button class="dropdown-item" id="export-csv-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>
              </svg>
              Export as CSV...
            </button>
            <button class="dropdown-item" id="export-parquet-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>
              </svg>
              Export as Parquet...
            </button>
            <button class="dropdown-item" id="export-json-btn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>
              </svg>
              Export as JSON...
            </button>
            <div class="dropdown-separator"></div>
            <button class="dropdown-item" id="history-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Query history
            </button>
          </div>
          <div class="history-dropdown" id="history-dropdown" style="display:none"></div>
        </div>
      </div>

      <div class="status-bar" id="status-bar"></div>

      <div class="result-area" id="result-area">
        <div class="empty-state" id="empty-state">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" opacity="0.35">
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

  <div class="cell-preview-overlay" id="cell-preview" style="display:none">
    <div class="cell-preview-modal">
      <div class="cell-preview-header">
        <span id="cell-preview-title"></span>
        <div class="cell-preview-actions">
          <button class="btn btn-secondary btn-sm" id="cell-preview-copy">Copy</button>
          <button class="icon-btn" id="cell-preview-close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <pre class="cell-preview-body" id="cell-preview-body"></pre>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    DuckDBViewerPanel.panels.delete(this.filePath);
    this.provider.dispose();
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
