import * as vscode from "vscode";
import { DuckDBViewerPanel } from "./webviewPanel";
import { DuckDBEditorProvider } from "./customEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  console.log("[DuckDB Viewer] Extension activating...");

  // Custom editor provider — auto-opens .parquet, .duckdb, .ddb on double-click
  const editorProvider = vscode.window.registerCustomEditorProvider(
    DuckDBEditorProvider.viewType,
    new DuckDBEditorProvider(context),
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // Command — right-click "Open with DuckDB Viewer" for all supported formats
  const command = vscode.commands.registerCommand(
    "duckdb-viewer.openFile",
    async (uri?: vscode.Uri) => {
      if (!uri) {
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            "Data Files": [
              "db", "duckdb", "ddb", "csv", "parquet",
              "json", "jsonl", "ndjson",
            ],
          },
        });
        if (!files || files.length === 0) return;
        uri = files[0];
      }
      DuckDBViewerPanel.createOrShow(context, uri);
    }
  );

  context.subscriptions.push(editorProvider, command);
  console.log("[DuckDB Viewer] Custom editor provider registered for viewType:", DuckDBEditorProvider.viewType);
}

export function deactivate(): void {}
