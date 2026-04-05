# DuckDB Viewer

Browse and query DuckDB databases, CSV, Parquet, and JSON files directly inside VS Code.

Right-click any `.db`, `.duckdb`, `.ddb`, `.csv`, `.parquet`, `.json`, `.jsonl`, or `.ndjson` file in the explorer and select **Open with DuckDB Viewer** to inspect data and run SQL queries without leaving your editor.

## Features

- **Multi-format support** — open DuckDB databases, CSV, Parquet, JSON, JSONL, and NDJSON files
- **SQL editor** — CodeMirror 6 with syntax highlighting, bracket matching, and search
- **Autocomplete** — DuckDB keywords, functions, and live table/column names
- **Schema tree** — expandable sidebar showing tables, columns, types, and row counts
- **Column sorting** — click headers to sort ASC/DESC
- **Cell preview** — click any cell to see full content with JSON auto-formatting
- **Query history** — last 50 queries stored and accessible via dropdown
- **Data grid** — paginated results with zebra striping, column resizing, and row numbers
- **Export** — copy results as CSV or formatted JSON
- **Theme-aware** — respects your VS Code dark/light theme
- **Refresh** — reconnect and reload if the file changes on disk

## Install

Search for **DuckDB Viewer** in the VS Code extensions marketplace, or:

```bash
code --install-extension caioricciuti.vs-duckdb-viewer
```

## Build locally

**Prerequisites:** Node.js 20+, npm

```bash
git clone https://github.com/caioricciuti/vs-duckdb-viewer.git
cd vs-duckdb-viewer
npm install
npm run build
```

## Test in VS Code

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. Right-click a `.duckdb`, `.csv`, or `.parquet` file → **Open with DuckDB Viewer**

## Package

```bash
npm run package
```

> **Note:** The extension uses native DuckDB bindings. For distribution, build platform-specific packages:
>
> ```bash
> npm run package:darwin-arm64
> npm run package:darwin-x64
> npm run package:linux-x64
> ```

## Keyboard shortcuts

| Action         | Shortcut                      |
| -------------- | ----------------------------- |
| Run query      | `Ctrl+Enter` / `Cmd+Enter`   |
| Explain query  | `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` |
| Focus editor   | `Ctrl+L` / `Cmd+L`           |
| Close modal    | `Escape`                      |

## Tech stack

- TypeScript + esbuild (dual build: extension + webview)
- `@duckdb/node-api` (native DuckDB bindings)
- CodeMirror 6 (SQL editor, autocomplete, syntax highlighting)
- VS Code CSS variables for theming

## License

MIT
