# Changelog

## 1.0.0 — 2026-04-05

### Added

- **Multi-format file support** — open CSV, Parquet, JSON, JSONL, and NDJSON files directly (loaded into in-memory DuckDB)
- **CodeMirror 6 SQL editor** — syntax highlighting, bracket matching, search, undo/redo
- **SQL autocomplete** — DuckDB keywords, functions, and live table/column names from schema
- **Schema tree sidebar** — expandable tables showing columns with types and row counts
- **Column sorting** — click column headers to cycle ASC/DESC/off
- **Cell preview modal** — click any cell to see full content, with JSON auto-formatting and copy button
- **Query history** — last 50 queries stored and accessible via dropdown
- **JSON export** — copy results as formatted JSON alongside existing CSV export
- **Column resizing** — drag column borders to adjust widths
- **Keyboard shortcuts** — Cmd/Ctrl+Enter (run), Cmd/Ctrl+Shift+Enter (explain), Cmd/Ctrl+L (focus editor), Escape (close modals)
- **Zebra-striped data grid** — alternating row backgrounds for readability
- Full VS Code dark/light theme integration via CSS variables

## 0.2.1 — 2026-04-05

### Changed

- Removed unused SVG icon

## 0.1.0 — 2026-04-04

### Added

- Initial release
- Open .db, .duckdb, .ddb files with right-click context menu
- Basic SQL editor with Ctrl/Cmd+Enter to run
- Paginated data grid with row numbers
- CSV export
- Error display
- Refresh button to reconnect
