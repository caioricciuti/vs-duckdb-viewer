import * as vscode from "vscode";
import { DuckDBViewerPanel } from "./webviewPanel";

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    "duckdb-viewer.openFile",
    async (uri?: vscode.Uri) => {
      if (!uri) {
        const files = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            "Data Files": ["db", "duckdb", "ddb", "csv", "parquet", "json", "jsonl", "ndjson"],
          },
        });
        if (!files || files.length === 0) return;
        uri = files[0];
      }
      DuckDBViewerPanel.createOrShow(context, uri);
    }
  );

  context.subscriptions.push(command);
}

export function deactivate(): void {}
