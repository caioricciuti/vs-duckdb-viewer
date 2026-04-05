# DuckDB Viewer

Browse and query DuckDB database files directly inside VS Code.

Right-click any `.db`, `.duckdb`, or `.ddb` file in the explorer and select **Open with DuckDB Viewer** to inspect tables and run SQL queries without leaving your editor.

## Features

- **Table browser** — sidebar lists all tables with row counts
- **Data grid** — paginated results with column types, resizable columns, row numbers
- **SQL editor** — write and run arbitrary queries with Ctrl/Cmd+Enter
- **Theme-aware** — respects your VS Code dark/light theme
- **Copy as CSV** — one-click export of visible results
- **Error display** — clear error messages for failed queries
- **Refresh** — reconnect and reload tables if the file changes on disk

## Install from VSIX

```bash
code --install-extension duckdb-viewer-0.1.0.vsix
```

## Build locally

**Prerequisites:** Node.js 20+, npm

```bash
# Clone and install
git clone https://github.com/caioricciuti/vs-duckdb-viewer.git
cd duckdb-viewer
npm install

# Build the extension
npm run build

# Create a test database (requires bun, or run with: npx tsx scripts/create-test-db.ts)
npm run create-test-db
```

## Test in VS Code

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the new window, open a folder containing a `.duckdb` file (or use `test/sample.duckdb`)
4. Right-click the file in the explorer → **Open with DuckDB Viewer**

## Package

```bash
npm run package
# Produces duckdb-viewer-0.1.0.vsix
```

> **Note:** The extension uses native DuckDB bindings. When packaging for distribution, build platform-specific packages:
>
> ```bash
> npx @vscode/vsce package --target darwin-arm64
> npx @vscode/vsce package --target darwin-x64
> npx @vscode/vsce package --target linux-x64
> ```


## Keyboard shortcuts

| Action    | Shortcut             |
| --------- | -------------------- |
| Run query | `Ctrl+Enter` / `Cmd+Enter` |
| Indent    | `Tab` (inserts 2 spaces)   |

## Tech stack

- TypeScript + esbuild
- `@duckdb/node-api` (native DuckDB bindings)
- Plain HTML/CSS/JS webview (no framework)
- VS Code CSS variables for theming

## License

MIT
