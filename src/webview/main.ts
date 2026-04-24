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

// ─── Query Builder State ───
let builderMode = false;
let builderTable: string | null = null;
let builderSelectedCols = new Set<string>();
let builderFilters: { col: string; op: string; val: string }[] = [];
let builderGroupBy = new Set<string>();
let builderOrderBy: string | null = null;
let builderOrderDir: SortDir = "ASC";
let builderLimit = 100;
let builderSelectAll = true;

// ─── Chart State ───
let activeView: "table" | "chart" | "diff" = "table";
let chartType: "bar" | "line" | "scatter" = "bar";
let chartXCol = 0;
let chartYCol = 1;

// ─── Diff State ───
let snapshotColumns: ColumnInfo[] = [];
let snapshotRows: unknown[][] = [];
let hasSnapshot = false;

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

// New feature elements
const attachFileBtn = $("attach-file-btn");
const queryEditorWrapper = $("query-editor-wrapper");
const sqlModeBtn = $("sql-mode-btn");
const builderModeBtn = $("builder-mode-btn");
const queryBuilder = $("query-builder");
const builderTableSelect = $("builder-table") as HTMLSelectElement;
const builderColumnsDiv = $("builder-columns");
const builderFiltersDiv = $("builder-filters");
const addFilterBtn = $("add-filter-btn");
const builderGroupBySelect = $("builder-groupby") as HTMLSelectElement;
const builderOrderBySelect = $("builder-orderby") as HTMLSelectElement;
const builderOrderDirSelect = $("builder-order-dir") as HTMLSelectElement;
const builderLimitInput = $("builder-limit") as HTMLInputElement;
const builderSqlPreview = $("builder-sql-preview");
const viewToggle = $("view-toggle");
const tableViewBtn = $("table-view-btn");
const chartViewBtn = $("chart-view-btn");
const snapshotBtn = $("snapshot-btn");
const compareBtn = $("compare-btn");
const chartPanel = $("chart-panel");
const chartTypeSelect = $("chart-type") as HTMLSelectElement;
const chartXColSelect = $("chart-x-col") as HTMLSelectElement;
const chartYColSelect = $("chart-y-col") as HTMLSelectElement;
const chartCanvas = $("chart-canvas");
const diffPanel = $("diff-panel");
const diffSummary = $("diff-summary");
const diffGrid = $("diff-grid");

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
      if (builderMode) populateBuilder();
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
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    editor.focus();
  }
  if (e.key === "Escape") {
    cellPreview.style.display = "none";
    historyDropdown.style.display = "none";
    actionsDropdown.style.display = "none";
    closeContextMenu();
  }
});

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

// ─── Mode toggle ───
sqlModeBtn.addEventListener("click", () => {
  builderMode = false;
  sqlModeBtn.classList.add("active");
  builderModeBtn.classList.remove("active");
  queryEditorWrapper.style.display = "";
  queryBuilder.style.display = "none";
});

builderModeBtn.addEventListener("click", () => {
  builderMode = true;
  builderModeBtn.classList.add("active");
  sqlModeBtn.classList.remove("active");
  queryEditorWrapper.style.display = "none";
  queryBuilder.style.display = "";
  populateBuilder();
});

// ─── Attach file ───
attachFileBtn.addEventListener("click", () => {
  vscode.postMessage({ type: "requestAttachFile" });
});

// ─── View toggles ───
tableViewBtn.addEventListener("click", () => switchView("table"));
chartViewBtn.addEventListener("click", () => switchView("chart"));

// ─── Snapshot & Compare ───
snapshotBtn.addEventListener("click", takeSnapshot);
compareBtn.addEventListener("click", showDiffView);

// ─── Chart controls ───
chartTypeSelect.addEventListener("change", () => {
  chartType = chartTypeSelect.value as "bar" | "line" | "scatter";
  renderChart();
});
chartXColSelect.addEventListener("change", () => {
  chartXCol = parseInt(chartXColSelect.value);
  renderChart();
});
chartYColSelect.addEventListener("change", () => {
  chartYCol = parseInt(chartYColSelect.value);
  renderChart();
});

// ─── Builder controls ───
builderTableSelect.addEventListener("change", () => {
  builderTable = builderTableSelect.value || null;
  builderSelectedCols.clear();
  builderSelectAll = true;
  builderFilters = [];
  builderGroupBy.clear();
  builderOrderBy = null;
  populateBuilderColumns();
  updateBuilderSql();
});
addFilterBtn.addEventListener("click", () => {
  if (!builderTable) return;
  builderFilters.push({ col: "", op: "=", val: "" });
  renderBuilderFilters();
  updateBuilderSql();
});
builderGroupBySelect.addEventListener("change", () => {
  builderGroupBy.clear();
  for (const opt of builderGroupBySelect.selectedOptions) {
    builderGroupBy.add(opt.value);
  }
  updateBuilderSql();
});
builderOrderBySelect.addEventListener("change", () => {
  builderOrderBy = builderOrderBySelect.value || null;
  updateBuilderSql();
});
builderOrderDirSelect.addEventListener("change", () => {
  builderOrderDir = builderOrderDirSelect.value as SortDir;
  updateBuilderSql();
});
builderLimitInput.addEventListener("input", () => {
  builderLimit = parseInt(builderLimitInput.value) || 100;
  updateBuilderSql();
});

// ─── Core functions ───

function runQuery(): void {
  let sql: string;
  if (builderMode) {
    sql = generateBuilderSql();
    editor.setValue(sql);
  } else {
    sql = editor.getValue().trim();
  }
  if (!sql || sql.startsWith("--")) return;
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

    const row = document.createElement("div");
    row.className = "tree-table" + (currentTable === t.name ? " active" : "");
    row.setAttribute("data-table", t.name);

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle" + (expandedTables.has(t.name) ? " expanded" : "");
    toggle.textContent = "▶";
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
  csvBtn.disabled = currentRows.length === 0;
  jsonBtn.disabled = currentRows.length === 0;
  profileBtn.disabled = !currentTable;
  exportCsvBtn.disabled = !lastExecutedSql;
  exportParquetBtn.disabled = !lastExecutedSql;
  exportJsonBtn.disabled = !lastExecutedSql;

  // Show view toggle when we have data
  viewToggle.style.display = currentColumns.length > 0 ? "flex" : "none";

  if (activeView === "chart") {
    gridWrapper.style.display = "none";
    chartPanel.style.display = "flex";
    diffPanel.style.display = "none";
    populateChartControls();
    renderChart();
  } else if (activeView === "diff") {
    activeView = "table";
    tableViewBtn.classList.add("active");
    chartViewBtn.classList.remove("active");
    gridWrapper.style.display = "flex";
    chartPanel.style.display = "none";
    diffPanel.style.display = "none";
    renderGrid();
  } else {
    gridWrapper.style.display = "flex";
    chartPanel.style.display = "none";
    diffPanel.style.display = "none";
    renderGrid();
  }

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
      ? `<span class="sort-arrow">${sortDir === "ASC" ? "▲" : "▼"}</span>`
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
  if (!currentTable || totalPages <= 1 || activeView !== "table") {
    pagination.style.display = "none";
    return;
  }
  pagination.style.display = "flex";
  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, totalRows);

  pagination.innerHTML =
    `<span class="pagination-info">Rows ${start.toLocaleString()} – ${end.toLocaleString()} of ${totalRows.toLocaleString()}</span>` +
    `<div class="pagination-controls">` +
    `<button class="page-btn" id="prev-btn"${currentPage === 0 ? " disabled" : ""}>← Prev</button>` +
    `<span class="page-indicator">Page ${currentPage + 1} of ${totalPages}</span>` +
    `<button class="page-btn" id="next-btn"${currentPage >= totalPages - 1 ? " disabled" : ""}>Next →</button>` +
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

    if (
      displayValue.startsWith("{") ||
      displayValue.startsWith("[")
    ) {
      try {
        displayValue = JSON.stringify(JSON.parse(displayValue), null, 2);
      } catch {
        // not JSON
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
    btn.textContent = "✓ Copied!";
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

// ─── View switching ───

function switchView(view: "table" | "chart" | "diff"): void {
  activeView = view;
  tableViewBtn.classList.toggle("active", view === "table");
  chartViewBtn.classList.toggle("active", view === "chart");

  gridWrapper.style.display = view === "table" ? "flex" : "none";
  chartPanel.style.display = view === "chart" ? "flex" : "none";
  diffPanel.style.display = view === "diff" ? "flex" : "none";
  pagination.style.display = view === "table" && currentTable && totalPages > 1 ? "flex" : "none";

  if (view === "chart") {
    populateChartControls();
    renderChart();
  }
}

// ─── Query Builder ───

function populateBuilder(): void {
  builderTableSelect.innerHTML = '<option value="">Select table...</option>';
  schemaTables.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    if (builderTable === t.name) opt.selected = true;
    builderTableSelect.appendChild(opt);
  });
  populateBuilderColumns();
  updateBuilderSql();
}

function populateBuilderColumns(): void {
  builderColumnsDiv.innerHTML = "";
  builderGroupBySelect.innerHTML = "";
  builderOrderBySelect.innerHTML = '<option value="">None</option>';

  const table = schemaTables.find((t) => t.name === builderTable);
  if (!table) {
    builderColumnsDiv.innerHTML = '<span class="builder-hint">Select a table first</span>';
    return;
  }

  const allLabel = document.createElement("label");
  allLabel.className = "builder-col-item";
  const allCb = document.createElement("input");
  allCb.type = "checkbox";
  allCb.checked = builderSelectAll;
  allCb.addEventListener("change", () => {
    builderSelectAll = allCb.checked;
    if (builderSelectAll) builderSelectedCols.clear();
    populateBuilderColumns();
    updateBuilderSql();
  });
  allLabel.appendChild(allCb);
  allLabel.appendChild(document.createTextNode(" * (all)"));
  builderColumnsDiv.appendChild(allLabel);

  table.columns.forEach((col) => {
    const label = document.createElement("label");
    label.className = "builder-col-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = builderSelectAll || builderSelectedCols.has(col.name);
    cb.disabled = builderSelectAll;
    cb.addEventListener("change", () => {
      if (cb.checked) builderSelectedCols.add(col.name);
      else builderSelectedCols.delete(col.name);
      updateBuilderSql();
    });
    const text = document.createElement("span");
    text.textContent = ` ${col.name}`;
    const typeSpan = document.createElement("span");
    typeSpan.className = "builder-col-type";
    typeSpan.textContent = col.type.toLowerCase();
    label.appendChild(cb);
    label.appendChild(text);
    label.appendChild(typeSpan);
    builderColumnsDiv.appendChild(label);

    const gbOpt = document.createElement("option");
    gbOpt.value = col.name;
    gbOpt.textContent = col.name;
    if (builderGroupBy.has(col.name)) gbOpt.selected = true;
    builderGroupBySelect.appendChild(gbOpt);

    const obOpt = document.createElement("option");
    obOpt.value = col.name;
    obOpt.textContent = col.name;
    if (builderOrderBy === col.name) obOpt.selected = true;
    builderOrderBySelect.appendChild(obOpt);
  });

  renderBuilderFilters();
}

function renderBuilderFilters(): void {
  builderFiltersDiv.innerHTML = "";
  const table = schemaTables.find((t) => t.name === builderTable);
  if (!table) return;

  builderFilters.forEach((filter, idx) => {
    const row = document.createElement("div");
    row.className = "builder-filter-row";

    const colSelect = document.createElement("select");
    colSelect.className = "builder-select";
    colSelect.innerHTML = '<option value="">Column...</option>';
    table.columns.forEach((col) => {
      const opt = document.createElement("option");
      opt.value = col.name;
      opt.textContent = col.name;
      if (filter.col === col.name) opt.selected = true;
      colSelect.appendChild(opt);
    });
    colSelect.addEventListener("change", () => {
      builderFilters[idx].col = colSelect.value;
      updateBuilderSql();
    });

    const opSelect = document.createElement("select");
    opSelect.className = "builder-select builder-select-sm";
    ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IS NULL", "IS NOT NULL"].forEach((op) => {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      if (filter.op === op) opt.selected = true;
      opSelect.appendChild(opt);
    });
    opSelect.addEventListener("change", () => {
      builderFilters[idx].op = opSelect.value;
      renderBuilderFilters();
      updateBuilderSql();
    });

    const valInput = document.createElement("input");
    valInput.className = "builder-input";
    valInput.placeholder = "Value...";
    valInput.value = filter.val;
    valInput.disabled = filter.op === "IS NULL" || filter.op === "IS NOT NULL";
    valInput.addEventListener("input", () => {
      builderFilters[idx].val = valInput.value;
      updateBuilderSql();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "icon-btn";
    removeBtn.title = "Remove filter";
    removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    removeBtn.addEventListener("click", () => {
      builderFilters.splice(idx, 1);
      renderBuilderFilters();
      updateBuilderSql();
    });

    row.appendChild(colSelect);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    builderFiltersDiv.appendChild(row);
  });
}

function updateBuilderSql(): void {
  builderSqlPreview.textContent = generateBuilderSql();
}

function generateBuilderSql(): string {
  if (!builderTable) return "-- Select a table to build a query";

  let cols = "*";
  if (!builderSelectAll && builderSelectedCols.size > 0) {
    cols = [...builderSelectedCols].map((c) => `"${c}"`).join(", ");
  }

  let sql = `SELECT ${cols}\nFROM "${builderTable}"`;

  const validFilters = builderFilters.filter((f) => {
    if (!f.col) return false;
    if (f.op === "IS NULL" || f.op === "IS NOT NULL") return true;
    return f.val !== "";
  });

  if (validFilters.length > 0) {
    const conditions = validFilters.map((f) => {
      if (f.op === "IS NULL") return `"${f.col}" IS NULL`;
      if (f.op === "IS NOT NULL") return `"${f.col}" IS NOT NULL`;
      if (f.op === "LIKE") return `"${f.col}" LIKE '${f.val.replace(/'/g, "''")}'`;
      const numVal = Number(f.val);
      const isNum = !isNaN(numVal) && f.val.trim() !== "";
      return `"${f.col}" ${f.op} ${isNum ? f.val : `'${f.val.replace(/'/g, "''")}'`}`;
    });
    sql += `\nWHERE ${conditions.join("\n  AND ")}`;
  }

  if (builderGroupBy.size > 0) {
    sql += `\nGROUP BY ${[...builderGroupBy].map((c) => `"${c}"`).join(", ")}`;
  }

  if (builderOrderBy) {
    sql += `\nORDER BY "${builderOrderBy}" ${builderOrderDir}`;
  }

  sql += `\nLIMIT ${builderLimit}`;

  return sql;
}

// ─── Charts ───

const CHART_COLORS = [
  "var(--vscode-charts-blue, var(--vscode-textLink-foreground, #4fc1ff))",
  "var(--vscode-charts-red, #f14c4c)",
  "var(--vscode-charts-green, #89d185)",
  "var(--vscode-charts-yellow, #cca700)",
  "var(--vscode-charts-purple, #b180d7)",
  "var(--vscode-charts-orange, #e8ab53)",
];

function isNumericType(type: string): boolean {
  const t = type.toUpperCase();
  return ["INTEGER", "BIGINT", "SMALLINT", "TINYINT", "FLOAT", "DOUBLE", "DECIMAL",
    "HUGEINT", "UBIGINT", "UINTEGER", "USMALLINT", "UTINYINT", "INT", "INT4",
    "INT8", "INT2", "REAL", "NUMERIC"].some((n) => t.includes(n));
}

function populateChartControls(): void {
  chartXColSelect.innerHTML = "";
  chartYColSelect.innerHTML = "";

  currentColumns.forEach((col, i) => {
    const xOpt = document.createElement("option");
    xOpt.value = String(i);
    xOpt.textContent = col.name;
    chartXColSelect.appendChild(xOpt);

    const yOpt = document.createElement("option");
    yOpt.value = String(i);
    yOpt.textContent = col.name;
    chartYColSelect.appendChild(yOpt);
  });

  const firstStringIdx = currentColumns.findIndex((c) => !isNumericType(c.type));
  const firstNumIdx = currentColumns.findIndex((c) => isNumericType(c.type));

  chartXCol = firstStringIdx >= 0 ? firstStringIdx : 0;
  chartYCol = firstNumIdx >= 0 ? firstNumIdx : (currentColumns.length > 1 ? 1 : 0);

  chartXColSelect.value = String(chartXCol);
  chartYColSelect.value = String(chartYCol);
}

function renderChart(): void {
  if (!currentColumns.length || !currentRows.length) {
    chartCanvas.innerHTML = '<div class="chart-empty">No data to visualize</div>';
    return;
  }

  const maxPoints = 200;
  const rows = currentRows.slice(0, maxPoints);
  const xValues = rows.map((r) => r[chartXCol] === null ? "NULL" : String(r[chartXCol]));
  const yValues = rows.map((r) => {
    const v = r[chartYCol];
    return v === null ? 0 : Number(v) || 0;
  });

  const width = chartCanvas.clientWidth || 600;
  const height = Math.min(400, Math.max(250, width * 0.5));

  switch (chartType) {
    case "bar":
      chartCanvas.innerHTML = renderBarChart(width, height, xValues, yValues);
      break;
    case "line":
      chartCanvas.innerHTML = renderLineChart(width, height, xValues, yValues);
      break;
    case "scatter":
      chartCanvas.innerHTML = renderScatterChart(width, height, rows);
      break;
  }

  if (currentRows.length > maxPoints) {
    chartCanvas.innerHTML += `<div class="chart-truncated">Showing first ${maxPoints} of ${currentRows.length} rows</div>`;
  }
}

function renderBarChart(width: number, height: number, labels: string[], values: number[]): string {
  const pad = { top: 20, right: 20, bottom: 80, left: 60 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const barW = Math.max(2, cw / labels.length - 2);
  const color = CHART_COLORS[0];

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`;

  for (let i = 0; i <= 5; i++) {
    const val = minVal + (range * i) / 5;
    const y = pad.top + ch - (ch * (val - minVal)) / range;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--vscode-editorWidget-border, rgba(128,128,128,0.2))" stroke-dasharray="3,3"/>`;
    svg += `<text x="${pad.left - 8}" y="${y + 3}" text-anchor="end" fill="var(--vscode-descriptionForeground)" font-size="10" font-family="var(--vscode-font-family)">${formatChartNum(val)}</text>`;
  }

  labels.forEach((label, i) => {
    const x = pad.left + i * (cw / labels.length) + 1;
    const barH = (ch * Math.abs(values[i])) / range;
    const y = values[i] >= 0
      ? pad.top + ch - (ch * (values[i] - minVal)) / range
      : pad.top + ch - (ch * (0 - minVal)) / range;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="1" opacity="0.85"><title>${esc(label)}: ${values[i]}</title></rect>`;
  });

  const step = Math.max(1, Math.ceil(labels.length / 25));
  labels.forEach((label, i) => {
    if (i % step !== 0) return;
    const x = pad.left + i * (cw / labels.length) + barW / 2;
    const displayLabel = label.length > 12 ? label.substring(0, 12) + ".." : label;
    svg += `<text x="${x}" y="${pad.top + ch + 14}" text-anchor="end" fill="var(--vscode-descriptionForeground)" font-size="10" font-family="var(--vscode-font-family)" transform="rotate(-45,${x},${pad.top + ch + 14})">${esc(displayLabel)}</text>`;
  });

  svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<line x1="${pad.left}" y1="${pad.top + ch}" x2="${width - pad.right}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<text x="${pad.left + cw / 2}" y="${height - 4}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11" font-family="var(--vscode-font-family)">${esc(currentColumns[chartXCol]?.name ?? "")}</text>`;
  svg += `<text x="14" y="${pad.top + ch / 2}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11" font-family="var(--vscode-font-family)" transform="rotate(-90,14,${pad.top + ch / 2})">${esc(currentColumns[chartYCol]?.name ?? "")}</text>`;
  svg += `</svg>`;
  return svg;
}

function renderLineChart(width: number, height: number, labels: string[], values: number[]): string {
  const pad = { top: 20, right: 20, bottom: 80, left: 60 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;
  const color = CHART_COLORS[0];

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`;

  for (let i = 0; i <= 5; i++) {
    const val = minVal + (range * i) / 5;
    const y = pad.top + ch - (ch * (val - minVal)) / range;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--vscode-editorWidget-border, rgba(128,128,128,0.2))" stroke-dasharray="3,3"/>`;
    svg += `<text x="${pad.left - 8}" y="${y + 3}" text-anchor="end" fill="var(--vscode-descriptionForeground)" font-size="10" font-family="var(--vscode-font-family)">${formatChartNum(val)}</text>`;
  }

  const points = values.map((v, i) => {
    const x = pad.left + (i / Math.max(1, values.length - 1)) * cw;
    const y = pad.top + ch - (ch * (v - minVal)) / range;
    return `${x},${y}`;
  });

  const firstX = pad.left;
  const lastX = pad.left + (values.length > 1 ? cw : 0);
  const bottomY = pad.top + ch;
  svg += `<polygon points="${points.join(" ")} ${lastX},${bottomY} ${firstX},${bottomY}" fill="${color}" opacity="0.08"/>`;
  svg += `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;

  values.forEach((v, i) => {
    const x = pad.left + (i / Math.max(1, values.length - 1)) * cw;
    const y = pad.top + ch - (ch * (v - minVal)) / range;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"><title>${esc(labels[i])}: ${v}</title></circle>`;
  });

  const step = Math.max(1, Math.ceil(labels.length / 15));
  labels.forEach((label, i) => {
    if (i % step !== 0) return;
    const x = pad.left + (i / Math.max(1, values.length - 1)) * cw;
    const displayLabel = label.length > 12 ? label.substring(0, 12) + ".." : label;
    svg += `<text x="${x}" y="${pad.top + ch + 14}" text-anchor="end" fill="var(--vscode-descriptionForeground)" font-size="10" font-family="var(--vscode-font-family)" transform="rotate(-45,${x},${pad.top + ch + 14})">${esc(displayLabel)}</text>`;
  });

  svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<line x1="${pad.left}" y1="${pad.top + ch}" x2="${width - pad.right}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<text x="${pad.left + cw / 2}" y="${height - 4}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11" font-family="var(--vscode-font-family)">${esc(currentColumns[chartXCol]?.name ?? "")}</text>`;
  svg += `<text x="14" y="${pad.top + ch / 2}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11" font-family="var(--vscode-font-family)" transform="rotate(-90,14,${pad.top + ch / 2})">${esc(currentColumns[chartYCol]?.name ?? "")}</text>`;
  svg += `</svg>`;
  return svg;
}

function renderScatterChart(width: number, height: number, rows: unknown[][]): string {
  const pad = { top: 20, right: 20, bottom: 80, left: 60 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const color = CHART_COLORS[0];

  const xVals = rows.map((r) => Number(r[chartXCol]) || 0);
  const yVals = rows.map((r) => Number(r[chartYCol]) || 0);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`;

  for (let i = 0; i <= 5; i++) {
    const yVal = yMin + (yRange * i) / 5;
    const y = pad.top + ch - (ch * (yVal - yMin)) / yRange;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--vscode-editorWidget-border, rgba(128,128,128,0.2))" stroke-dasharray="3,3"/>`;
    svg += `<text x="${pad.left - 8}" y="${y + 3}" text-anchor="end" fill="var(--vscode-descriptionForeground)" font-size="10">${formatChartNum(yVal)}</text>`;

    const xVal = xMin + (xRange * i) / 5;
    const x = pad.left + (cw * (xVal - xMin)) / xRange;
    svg += `<text x="${x}" y="${pad.top + ch + 14}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="10">${formatChartNum(xVal)}</text>`;
  }

  rows.forEach((_, i) => {
    const x = pad.left + (cw * (xVals[i] - xMin)) / xRange;
    const y = pad.top + ch - (ch * (yVals[i] - yMin)) / yRange;
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" opacity="0.7"><title>(${xVals[i]}, ${yVals[i]})</title></circle>`;
  });

  svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<line x1="${pad.left}" y1="${pad.top + ch}" x2="${width - pad.right}" y2="${pad.top + ch}" stroke="var(--vscode-editor-foreground)" opacity="0.3"/>`;
  svg += `<text x="${pad.left + cw / 2}" y="${height - 4}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11">${esc(currentColumns[chartXCol]?.name ?? "")}</text>`;
  svg += `<text x="14" y="${pad.top + ch / 2}" text-anchor="middle" fill="var(--vscode-descriptionForeground)" font-size="11" transform="rotate(-90,14,${pad.top + ch / 2})">${esc(currentColumns[chartYCol]?.name ?? "")}</text>`;
  svg += `</svg>`;
  return svg;
}

function formatChartNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

// ─── Diff / Compare ───

function takeSnapshot(): void {
  if (!currentColumns.length || !currentRows.length) return;
  snapshotColumns = [...currentColumns];
  snapshotRows = currentRows.map((r) => [...(r as unknown[])]);
  hasSnapshot = true;
  compareBtn.style.display = "";
  snapshotBtn.textContent = "Saved!";
  setTimeout(() => { snapshotBtn.textContent = "Snapshot"; }, 1200);
}

function showDiffView(): void {
  if (!hasSnapshot) return;

  const maxRows = Math.max(snapshotRows.length, currentRows.length);
  const allCols = currentColumns.length > 0 ? currentColumns : snapshotColumns;

  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  type DiffRow = { type: "added" | "removed" | "changed" | "unchanged"; cells: unknown[]; changedCells?: Set<number> };
  const diffRows: DiffRow[] = [];

  for (let i = 0; i < maxRows; i++) {
    const snapRow = snapshotRows[i] as unknown[] | undefined;
    const currRow = currentRows[i] as unknown[] | undefined;

    if (!snapRow && currRow) {
      added++;
      diffRows.push({ type: "added", cells: currRow });
    } else if (snapRow && !currRow) {
      removed++;
      diffRows.push({ type: "removed", cells: snapRow });
    } else if (snapRow && currRow) {
      const changedCells = new Set<number>();
      const maxCells = Math.max(snapRow.length, currRow.length);
      for (let c = 0; c < maxCells; c++) {
        if (String(snapRow[c] ?? "") !== String(currRow[c] ?? "")) {
          changedCells.add(c);
        }
      }
      if (changedCells.size > 0) {
        changed++;
        diffRows.push({ type: "changed", cells: currRow, changedCells });
      } else {
        unchanged++;
        diffRows.push({ type: "unchanged", cells: currRow });
      }
    }
  }

  diffSummary.innerHTML = `
    <span class="diff-stat diff-stat-added">${added} added</span>
    <span class="diff-stat diff-stat-removed">${removed} removed</span>
    <span class="diff-stat diff-stat-changed">${changed} changed</span>
    <span class="diff-stat diff-stat-unchanged">${unchanged} unchanged</span>
  `;

  let html = "<thead><tr>";
  html += '<th class="row-num-header">#</th>';
  html += '<th class="diff-status-col">Status</th>';
  allCols.forEach((col) => {
    html += `<th>${esc(col.name)}<span class="col-type">${esc(col.type)}</span></th>`;
  });
  html += "</tr></thead><tbody>";

  diffRows.forEach((dr, i) => {
    html += `<tr class="diff-row-${dr.type}">`;
    html += `<td class="row-num">${i + 1}</td>`;
    const statusLabel = dr.type === "unchanged" ? "—" : dr.type;
    html += `<td class="diff-status-cell">${statusLabel}</td>`;
    (dr.cells as unknown[]).forEach((cell, ci) => {
      const cellClass = dr.changedCells?.has(ci) ? " diff-cell-changed" : "";
      const val = cell === null || cell === undefined ? "NULL" : String(cell);
      html += `<td class="${cellClass}">${esc(val)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";

  diffGrid.innerHTML = html;

  activeView = "diff";
  gridWrapper.style.display = "none";
  chartPanel.style.display = "none";
  diffPanel.style.display = "flex";
  pagination.style.display = "none";
  tableViewBtn.classList.remove("active");
  chartViewBtn.classList.remove("active");
  viewToggle.style.display = "flex";
}

// ─── Helpers ───

function showError(message: string): void {
  emptyState.style.display = "none";
  gridWrapper.style.display = "none";
  chartPanel.style.display = "none";
  diffPanel.style.display = "none";
  errorBanner.style.display = "block";
  errorBanner.textContent = message;
  pagination.style.display = "none";
  viewToggle.style.display = "none";
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
