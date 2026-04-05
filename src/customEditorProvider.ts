import * as vscode from "vscode";
import { DuckDBViewerPanel } from "./webviewPanel";

class DuckDBDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

export class DuckDBEditorProvider
  implements vscode.CustomReadonlyEditorProvider<DuckDBDocument>
{
  static readonly viewType = "duckdb-viewer.dataViewer";

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): DuckDBDocument {
    return new DuckDBDocument(uri);
  }

  async resolveCustomEditor(
    document: DuckDBDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "src", "webview"),
      ],
    };
    await DuckDBViewerPanel.initWithPanel(
      webviewPanel,
      this.context,
      document.uri
    );
  }
}
