# Changelog

## 1.1.1 — 2026-04-06

### Fixed

- Fixed custom editor not auto-opening files on double-click
- Added diagnostic logging for custom editor lifecycle

## 1.1.0 — 2026-04-05

### Added

- **Auto-open on double-click** — `.parquet`, `.duckdb`, and `.ddb` files now open directly in the viewer via Custom Editor API (no right-click needed)
- **Data profiling** — one-click SUMMARIZE shows min, max, avg, std, quartiles, null%, and unique count per column
- **Export to file** — save query results to CSV, Parquet, or JSON files on disk using DuckDB's native COPY
- **DESCRIBE table** — right-click any table in the schema tree to see column details
- **Table context menu** — right-click tables for quick access to Describe and Profile actions

### Changed

- Expanded marketplace keywords for better discoverability (parquet viewer, csv viewer, data explorer, analytics, data science)
- Updated extension description to highlight multi-format support

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
