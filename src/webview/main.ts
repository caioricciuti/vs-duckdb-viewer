import { createEditor, type EditorController } from "./editor";
import {
  PAGE_SIZE,
  type ColumnInfo,
  type SchemaTable,
  type WebviewIncomingMessage,
  type SortDir,
} from "../shared/types";

declare function acquireVsCodeApi(): {
  postMessage(msg: Record<string, unknown>): void;
  getState(): Record<string, unknown> | undefined;
  setState(state: Record<string, unknown>): void;
};

const vscode = acquireVsCodeApi();

// ─── State ───
let currentTable: string | null = null;
let currentPage = 0;
let totalRows = 0;
let totalPages = 0;
let currentColumns: ColumnInfo[] = [];
let currentRows: unknown[][] = [];
let sortColumn: string | null = null;
let sortDir: SortDir = "ASC";
let expandedTables = new Set<string>();
let schemaTables: SchemaTable[] = [];
let lastExecutedSql: string | null = null;

// ─── Elements ───
const $ = (id: string) => document.getElementById(id)!;
const tableList = $("table-list");
const runBtn = $("run-btn");
const csvBtn = $("csv-btn") as HTMLButtonElement;
const jsonBtn = $("json-btn") as HTMLButtonElement;
const historyBtn = $("history-btn");
const moreBtn = $("more-btn");
const actionsDropdown = $("actions-dropdown");
const profileBtn = $("profile-btn") as HTMLButtonElement;
const exportCsvBtn = $("export-csv-btn") as HTMLButtonElement;
const exportParquetBtn = $("export-parquet-btn") as HTMLButtonElement;
const exportJsonBtn = $("export-json-btn") as HTMLButtonElement;
const refreshBtn = $("refresh-btn");
const statusBar = $("status-bar");
const emptyState = $("empty-state");
const gridWrapper = $("grid-wrapper");
const gridContainer = $("grid-container");
const dataGrid = $("data-grid");
const errorBanner = $("error-banner");
const pagination = $("pagination");
const loading = $("loading");
const cellPreview = $("cell-preview");
const cellPreviewTitle = $("cell-preview-title");
const cellPreviewBody = $("cell-preview-body");
const historyDropdown = $("history-dropdown");

// ─── Editor ───
const isMac = navigator.userAgent.includes("Mac");
const modKey = isMac ? "Cmd" : "Ctrl";

const editor: EditorController = createEditor($("query-editor"), {
  onRun: runQuery,
  onExplain: runExplain,
  placeholder: `Write SQL and press ${modKey}+Enter to run...`,
});

// ─── Message handler ───
window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as WebviewIncomingMessage;
  switch (msg.type) {
    case "schemaLoaded":
      schemaTables = msg.schema.tables;
      renderSchemaTree();
      editor.updateSchema(schemaTables);
      hideLoading();
      break;
    case "queryResult":
      renderResult(msg);
      hideLoading();
      break;
    case "historyLoaded":
      renderHistory(msg.history);
      break;
    case "exportComplete":
      statusBar.innerHTML = `<span class="status-item">Exported to ${msg.path}</span>`;
      hideLoading();
      break;
    case "error":
      showError(msg.message);
      hideLoading();
      break;
  }
});

// ─── Event listeners ───
runBtn.addEventListener("click", runQuery);
csvBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  copyAsCsv();
});
jsonBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  copyAsJson();
});
refreshBtn.addEventListener("click", () => {
  showLoading();
  vscode.postMessage({ type: "refresh" });
});
moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  historyDropdown.style.display = "none";
  actionsDropdown.style.display =
    actionsDropdown.style.display === "block" ? "none" : "block";
});
historyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  vscode.postMessage({ type: "getHistory" });
});
profileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  if (!currentTable) return;
  showLoading();
  clearError();
  vscode.postMessage({ type: "summarize", table: currentTable });
});
exportCsvBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  if (lastExecutedSql) {
    showLoading();
    vscode.postMessage({ type: "exportToFile", format: "csv", sql: lastExecutedSql });
  }
});
exportParquetBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  if (lastExecutedSql) {
    showLoading();
    vscode.postMessage({ type: "exportToFile", format: "parquet", sql: lastExecutedSql });
  }
});
exportJsonBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  actionsDropdown.style.display = "none";
  if (lastExecutedSql) {
    showLoading();
    vscode.postMessage({ type: "exportToFile", format: "json", sql: lastExecutedSql });
  }
});

// Global keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Cmd+L → focus editor
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    editor.focus();
  }
  // Escape → close modals
  if (e.key === "Escape") {
    cellPreview.style.display = "none";
    historyDropdown.style.display = "none";
    actionsDropdown.style.display = "none";
    closeContextMenu();
  }
});

// Close dropdowns when clicking outside
document.addEventListener("click", () => {
  historyDropdown.style.display = "none";
  actionsDropdown.style.display = "none";
});

// Cell preview close
$("cell-preview-close").addEventListener("click", () => {
  cellPreview.style.display = "none";
});
$("cell-preview-copy").addEventListener("click", () => {
  navigator.clipboard.writeText(cellPreviewBody.textContent ?? "");
  const btn = $("cell-preview-copy");
  btn.textContent = "Copied!";
  setTimeout(() => {
    btn.textContent = "Copy";
  }, 1200);
});
cellPreview.addEventListener("click", (e) => {
  if (e.target === cellPreview) cellPreview.style.display = "none";
});

// ─── Core functions ───

function runQuery(): void {
  const sql = editor.getValue().trim();
  if (!sql) return;
  lastExecutedSql = sql;
  showLoading();
  clearError();
  currentTable = null;
  sortColumn = null;
  document.querySelectorAll(".tree-table").forEach((el) => el.classList.remove("active"));
  vscode.postMessage({ type: "runQuery", sql });
}

function runExplain(): void {
  const sql = editor.getValue().trim();
  if (!sql) return;
  showLoading();
  clearError();
  currentTable = null;
  sortColumn = null;
  vscode.postMessage({ type: "runQuery", sql: "EXPLAIN " + sql });
}

function selectTable(name: string): void {
  currentTable = name;
  currentPage = 0;
  sortColumn = null;
  lastExecutedSql = `SELECT * FROM "${name}"`;
  editor.setValue(`SELECT * FROM "${name}" LIMIT ${PAGE_SIZE}`);
  showLoading();
  clearError();
  document.querySelectorAll(".tree-table").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-table") === name);
  });
  vscode.postMessage({ type: "selectTable", table: name, page: 0 });
}

// ─── Schema tree ───

function renderSchemaTree(): void {
  tableList.innerHTML = "";
  if (schemaTables.length === 0) {
    const li = document.createElement("li");
    li.className = "table-empty";
    li.textContent = "No tables found";
    tableList.appendChild(li);
    return;
  }
  schemaTables.forEach((t) => {
    const li = document.createElement("li");
    li.className = "tree-item";

    // Table row
    const row = document.createElement("div");
    row.className = "tree-table" + (currentTable === t.name ? " active" : "");
    row.setAttribute("data-table", t.name);

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle" + (expandedTables.has(t.name) ? " expanded" : "");
    toggle.textContent = "\u25B6";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (expandedTables.has(t.name)) {
        expandedTables.delete(t.name);
      } else {
        expandedTables.add(t.name);
      }
      renderSchemaTree();
    });

    const name = document.createElement("span");
    name.className = "tree-table-name";
    name.textContent = t.name;
    name.title = t.name;

    const badge = document.createElement("span");
    badge.className = "table-badge";
    badge.textContent = formatNumber(t.rowCount);
    badge.title = t.rowCount >= 0 ? t.rowCount.toLocaleString() + " rows" : "unknown";

    row.appendChild(toggle);
    row.appendChild(name);
    row.appendChild(badge);
    row.addEventListener("click", () => selectTable(t.name));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTableContextMenu(e as MouseEvent, t.name);
    });
    li.appendChild(row);

    // Columns (if expanded)
    if (expandedTables.has(t.name)) {
      const colList = document.createElement("ul");
      colList.className = "tree-columns";
      t.columns.forEach((col) => {
        const colItem = document.createElement("li");
        colItem.className = "tree-column";

        const colName = document.createElement("span");
        colName.className = "tree-col-name";
        colName.textContent = col.name;
        colName.title = `Click to insert "${col.name}" into editor`;
        colName.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.insertAtCursor(`"${col.name}"`);
        });

        const colType = document.createElement("span");
        colType.className = "tree-col-type";
        colType.textContent = col.type.toLowerCase();

        colItem.appendChild(colName);
        colItem.appendChild(colType);
        colList.appendChild(colItem);
      });
      li.appendChild(colList);
    }

    tableList.appendChild(li);
  });
}

// ─── Table context menu ───

function showTableContextMenu(e: MouseEvent, tableName: string): void {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";

  const describeItem = document.createElement("button");
  describeItem.className = "dropdown-item";
  describeItem.textContent = "Describe";
  describeItem.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    showLoading();
    clearError();
    vscode.postMessage({ type: "describeTable", table: tableName });
  });

  const profileItem = document.createElement("button");
  profileItem.className = "dropdown-item";
  profileItem.textContent = "Profile";
  profileItem.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    showLoading();
    clearError();
    vscode.postMessage({ type: "summarize", table: tableName });
  });

  menu.appendChild(describeItem);
  menu.appendChild(profileItem);
  document.body.appendChild(menu);

  // Close on next click or Escape
  setTimeout(() => {
    const close = () => { closeContextMenu(); document.removeEventListener("click", close); };
    document.addEventListener("click", close);
  }, 0);
}

function closeContextMenu(): void {
  document.querySelectorAll(".context-menu").forEach((el) => el.remove());
}

// ─── Result rendering ───

function renderResult(result: {
  columns?: ColumnInfo[];
  rows?: unknown[][];
  totalRows?: number;
  timeMs?: number;
  table?: string;
  page?: number;
  sortColumn?: string;
  sortDir?: string;
}): void {
  currentColumns = result.columns ?? [];
  currentRows = result.rows ?? [];
  totalRows = result.totalRows ?? currentRows.length;
  totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  if (result.page !== undefined) currentPage = result.page;
  if (result.table) currentTable = result.table;
  if (result.sortColumn !== undefined) sortColumn = result.sortColumn || null;
  if (result.sortDir) sortDir = result.sortDir as SortDir;

  // Status bar
  const parts: string[] = [];
  if (result.timeMs !== undefined) {
    parts.push(`<span class="status-item">${formatTime(result.timeMs)}</span>`);
  }
  parts.push(
    `<span class="status-item">${totalRows.toLocaleString()} row${totalRows !== 1 ? "s" : ""}</span>`
  );
  parts.push(
    `<span class="status-item">${currentColumns.length} col${currentColumns.length !== 1 ? "s" : ""}</span>`
  );
  statusBar.innerHTML = parts.join('<span style="opacity:0.3">|</span>');

  emptyState.style.display = "none";
  errorBanner.style.display = "none";
  gridWrapper.style.display = "flex";
  csvBtn.disabled = currentRows.length === 0;
  jsonBtn.disabled = currentRows.length === 0;
  profileBtn.disabled = !currentTable;
  exportCsvBtn.disabled = !lastExecutedSql;
  exportParquetBtn.disabled = !lastExecutedSql;
  exportJsonBtn.disabled = !lastExecutedSql;

  renderGrid();
  renderPagination();
}

function renderGrid(): void {
  if (currentColumns.length === 0) {
    dataGrid.innerHTML =
      '<tbody><tr><td style="padding:20px;color:var(--vscode-descriptionForeground)">Query returned no columns.</td></tr></tbody>';
    return;
  }

  const rowOffset = currentTable ? currentPage * PAGE_SIZE : 0;
  let html = "<thead><tr>";
  html += '<th class="row-num-header">#</th>';

  currentColumns.forEach((col, i) => {
    const w = calcColWidth(col, i);
    const isSorted = currentTable && sortColumn === col.name;
    const arrow = isSorted
      ? `<span class="sort-arrow">${sortDir === "ASC" ? "\u25B2" : "\u25BC"}</span>`
      : "";
    const sortClass = currentTable ? " col-sortable" : "";
    const sortedClass = isSorted ? " col-sorted" : "";

    html += `<th style="min-width:${w}px;width:${w}px" class="${sortClass}${sortedClass}" data-col-idx="${i}">`;
    html += `<span class="col-name">${esc(col.name)}</span>${arrow}`;
    html += `<span class="col-type">${esc(col.type)}</span>`;
    html += `<div class="col-resizer" data-col="${i}"></div>`;
    html += "</th>";
  });
  html += "</tr></thead><tbody>";

  currentRows.forEach((row, ri) => {
    html += "<tr>";
    html += `<td class="row-num">${rowOffset + ri + 1}</td>`;
    (row as unknown[]).forEach((cell, ci) => {
      const dataAttrs = `data-row="${ri}" data-col="${ci}"`;
      if (cell === null || cell === undefined) {
        html += `<td class="cell-null cell-clickable" ${dataAttrs}>NULL</td>`;
      } else {
        const cls = getCellClass(cell, currentColumns[ci]);
        html += `<td class="${cls} cell-clickable" ${dataAttrs}>${esc(String(cell))}</td>`;
      }
    });
    html += "</tr>";
  });
  html += "</tbody>";

  dataGrid.innerHTML = html;
  initColumnResize();
  initSortHeaders();
  initCellClick();
  gridContainer.scrollTop = 0;
}

function renderPagination(): void {
  if (!currentTable || totalPages <= 1) {
    pagination.style.display = "none";
    return;
  }
  pagination.style.display = "flex";
  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, totalRows);

  pagination.innerHTML =
    `<span class="pagination-info">Rows ${start.toLocaleString()} \u2013 ${end.toLocaleString()} of ${totalRows.toLocaleString()}</span>` +
    `<div class="pagination-controls">` +
    `<button class="page-btn" id="prev-btn"${currentPage === 0 ? " disabled" : ""}>\u2190 Prev</button>` +
    `<span class="page-indicator">Page ${currentPage + 1} of ${totalPages}</span>` +
    `<button class="page-btn" id="next-btn"${currentPage >= totalPages - 1 ? " disabled" : ""}>Next \u2192</button>` +
    `</div>`;

  $("prev-btn")?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      showLoading();
      vscode.postMessage({
        type: "selectTable",
        table: currentTable,
        page: currentPage,
        sortColumn,
        sortDir,
      });
    }
  });
  $("next-btn")?.addEventListener("click", () => {
    if (currentPage < totalPages - 1) {
      currentPage++;
      showLoading();
      vscode.postMessage({
        type: "selectTable",
        table: currentTable,
        page: currentPage,
        sortColumn,
        sortDir,
      });
    }
  });
}

// ─── Column sorting ───

function initSortHeaders(): void {
  if (!currentTable) return;
  dataGrid.querySelectorAll("th.col-sortable").forEach((th) => {
    th.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("col-resizer")) return;

      const idx = parseInt(th.getAttribute("data-col-idx") ?? "0");
      const colName = currentColumns[idx]?.name;
      if (!colName) return;

      if (sortColumn === colName) {
        if (sortDir === "ASC") {
          sortDir = "DESC";
        } else {
          sortColumn = null;
          sortDir = "ASC";
        }
      } else {
        sortColumn = colName;
        sortDir = "ASC";
      }

      currentPage = 0;
      showLoading();
      vscode.postMessage({
        type: "selectTable",
        table: currentTable,
        page: 0,
        sortColumn,
        sortDir,
      });
    });
  });
}

// ─── Cell preview ───

function initCellClick(): void {
  dataGrid.querySelector("tbody")?.addEventListener("click", (e) => {
    const td = (e.target as HTMLElement).closest(".cell-clickable") as HTMLElement | null;
    if (!td) return;

    const ri = parseInt(td.getAttribute("data-row") ?? "0");
    const ci = parseInt(td.getAttribute("data-col") ?? "0");
    const value = currentRows[ri]?.[ci];
    const col = currentColumns[ci];

    cellPreviewTitle.textContent = col ? `${col.name} (${col.type})` : "";

    let displayValue =
      value === null || value === undefined ? "NULL" : String(value);

    // Try to format JSON
    if (
      displayValue.startsWith("{") ||
      displayValue.startsWith("[")
    ) {
      try {
        displayValue = JSON.stringify(JSON.parse(displayValue), null, 2);
      } catch {
        // not JSON, show raw
      }
    }

    cellPreviewBody.textContent = displayValue;
    cellPreview.style.display = "flex";
    ($("cell-preview-close") as HTMLElement).focus();
  });
}

// ─── Export ───

function copyAsCsv(): void {
  if (!currentColumns.length || !currentRows.length) return;
  const header = currentColumns.map((c) => csvEsc(c.name)).join(",");
  const rows = currentRows.map((row) =>
    (row as unknown[])
      .map((cell) => csvEsc(cell === null || cell === undefined ? "" : String(cell)))
      .join(",")
  );
  const csv = [header, ...rows].join("\n");
  copyToClipboard(csv, csvBtn);
}

function copyAsJson(): void {
  if (!currentColumns.length || !currentRows.length) return;
  const data = currentRows.map((row) => {
    const obj: Record<string, unknown> = {};
    currentColumns.forEach((col, i) => {
      obj[col.name] = (row as unknown[])[i];
    });
    return obj;
  });
  copyToClipboard(JSON.stringify(data, null, 2), jsonBtn);
}

function copyToClipboard(text: string, btn: HTMLButtonElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = "\u2713 Copied!";
    setTimeout(() => {
      btn.textContent = orig;
    }, 1200);
  });
}

function csvEsc(str: string): string {
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ─── Query history ───

function renderHistory(history: string[]): void {
  historyDropdown.innerHTML = "";
  if (history.length === 0) {
    historyDropdown.innerHTML = '<div class="history-empty">No queries yet</div>';
  } else {
    history.forEach((sql) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;
      item.title = sql;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        editor.setValue(sql);
        editor.focus();
        historyDropdown.style.display = "none";
      });
      historyDropdown.appendChild(item);
    });
  }
  historyDropdown.style.display = "block";
}

// ─── Column resize ───

function initColumnResize(): void {
  dataGrid.querySelectorAll(".col-resizer").forEach((resizer) => {
    resizer.addEventListener("mousedown", (e: Event) => {
      const me = e as MouseEvent;
      me.preventDefault();
      me.stopPropagation();
      const th = (resizer as HTMLElement).parentElement!;
      const startX = me.pageX;
      const startWidth = th.offsetWidth;
      (resizer as HTMLElement).classList.add("active");

      function onMove(ev: MouseEvent): void {
        const newWidth = Math.max(50, startWidth + (ev.pageX - startX));
        th.style.width = newWidth + "px";
        th.style.minWidth = newWidth + "px";
        th.style.maxWidth = newWidth + "px";
      }
      function onUp(): void {
        (resizer as HTMLElement).classList.remove("active");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// ─── Helpers ───

function showError(message: string): void {
  emptyState.style.display = "none";
  gridWrapper.style.display = "none";
  errorBanner.style.display = "block";
  errorBanner.textContent = message;
  pagination.style.display = "none";
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  statusBar.innerHTML = "";
}

function clearError(): void {
  errorBanner.style.display = "none";
}

function showLoading(): void {
  loading.style.display = "flex";
}

function hideLoading(): void {
  loading.style.display = "none";
}

function calcColWidth(col: ColumnInfo, colIdx: number): number {
  const headerLen = Math.max((col.name || "").length, (col.type || "").length);
  // Sample first 20 rows to estimate content width
  let maxDataLen = 0;
  const sampleSize = Math.min(currentRows.length, 20);
  for (let i = 0; i < sampleSize; i++) {
    const val = currentRows[i]?.[colIdx];
    const len = val === null || val === undefined ? 4 : String(val).length;
    if (len > maxDataLen) maxDataLen = len;
  }
  const contentLen = Math.max(headerLen, maxDataLen);
  return Math.min(Math.max(contentLen * 7.5 + 24, 60), 400);
}

function getCellClass(value: unknown, col: ColumnInfo | undefined): string {
  if (value === null || value === undefined) return "cell-null";
  const t = ((col?.type) ?? "").toUpperCase();
  if (
    ["INTEGER", "BIGINT", "SMALLINT", "TINYINT", "FLOAT", "DOUBLE", "DECIMAL",
      "HUGEINT", "UBIGINT", "UINTEGER", "USMALLINT", "UTINYINT", "INT", "INT4",
      "INT8", "INT2", "REAL", "NUMERIC"].some((n) => t.includes(n))
  ) {
    return "cell-number";
  }
  if (t === "BOOLEAN" || t === "BOOL") return "cell-bool";
  return "";
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

function formatNumber(n: number): string {
  if (n < 0) return "?";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function esc(str: string): string {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
