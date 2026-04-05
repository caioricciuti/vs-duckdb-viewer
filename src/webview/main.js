// @ts-nocheck — runs in the webview, not in the extension host
(function () {
  /** @type {ReturnType<typeof acquireVsCodeApi>} */
  const vscode = acquireVsCodeApi();

  const PAGE_SIZE = 100;

  // ─── State ───
  let currentTable = null;
  let currentPage = 0;
  let totalRows = 0;
  let totalPages = 0;
  let currentColumns = [];
  let currentRows = [];

  // ─── Elements ───
  const $ = (id) => document.getElementById(id);
  const tableList = $("table-list");
  const queryInput = $("query-input");
  const runBtn = $("run-btn");
  const csvBtn = $("csv-btn");
  const refreshBtn = $("refresh-btn");
  const statusBar = $("status-bar");
  const emptyState = $("empty-state");
  const gridWrapper = $("grid-wrapper");
  const gridContainer = $("grid-container");
  const dataGrid = $("data-grid");
  const errorBanner = $("error-banner");
  const pagination = $("pagination");
  const loading = $("loading");

  // ─── Message handler ───
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "tablesLoaded":
        renderTables(msg.tables);
        hideLoading();
        break;
      case "queryResult":
        renderResult(msg);
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
  csvBtn.addEventListener("click", copyAsCsv);
  refreshBtn.addEventListener("click", () => {
    showLoading();
    vscode.postMessage({ type: "refresh" });
  });
  queryInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
    // Tab inserts 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const start = queryInput.selectionStart;
      const end = queryInput.selectionEnd;
      queryInput.value =
        queryInput.value.substring(0, start) +
        "  " +
        queryInput.value.substring(end);
      queryInput.selectionStart = queryInput.selectionEnd = start + 2;
    }
  });

  // ─── Core functions ───

  function runQuery() {
    const sql = queryInput.value.trim();
    if (!sql) return;
    showLoading();
    clearError();
    currentTable = null;
    document
      .querySelectorAll(".table-item")
      .forEach((el) => el.classList.remove("active"));
    vscode.postMessage({ type: "runQuery", sql });
  }

  function selectTable(name) {
    currentTable = name;
    currentPage = 0;
    queryInput.value = 'SELECT * FROM "' + name + '" LIMIT ' + PAGE_SIZE;
    showLoading();
    clearError();
    document.querySelectorAll(".table-item").forEach((el) => {
      const nameEl = el.querySelector(".table-name");
      el.classList.toggle("active", nameEl && nameEl.textContent === name);
    });
    vscode.postMessage({ type: "selectTable", table: name, page: 0 });
  }

  // ─── Rendering ───

  function renderTables(tables) {
    tableList.innerHTML = "";
    if (!tables || tables.length === 0) {
      const li = document.createElement("li");
      li.className = "table-empty";
      li.textContent = "No tables found";
      tableList.appendChild(li);
      return;
    }
    tables.forEach((t) => {
      const li = document.createElement("li");
      li.className = "table-item";
      if (currentTable === t.name) li.classList.add("active");

      const name = document.createElement("span");
      name.className = "table-name";
      name.textContent = t.name;
      name.title = t.name;

      const badge = document.createElement("span");
      badge.className = "table-badge";
      badge.textContent = formatNumber(t.rowCount);
      badge.title = t.rowCount >= 0 ? t.rowCount.toLocaleString() + " rows" : "unknown";

      li.appendChild(name);
      li.appendChild(badge);
      li.addEventListener("click", () => selectTable(t.name));
      tableList.appendChild(li);
    });
  }

  function renderResult(result) {
    currentColumns = result.columns || [];
    currentRows = result.rows || [];
    totalRows = result.totalRows ?? currentRows.length;
    totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

    if (result.page !== undefined) {
      currentPage = result.page;
    }
    if (result.table) {
      currentTable = result.table;
    }

    // Status bar
    const parts = [];
    if (result.timeMs !== undefined) {
      parts.push('<span class="status-item">' + result.timeMs + " ms</span>");
    }
    parts.push(
      '<span class="status-item">' +
        totalRows.toLocaleString() +
        " row" +
        (totalRows !== 1 ? "s" : "") +
        "</span>"
    );
    parts.push(
      '<span class="status-item">' +
        currentColumns.length +
        " col" +
        (currentColumns.length !== 1 ? "s" : "") +
        "</span>"
    );
    statusBar.innerHTML = parts.join('<span style="opacity:0.3">|</span>');

    // Show grid
    emptyState.style.display = "none";
    errorBanner.style.display = "none";
    gridWrapper.style.display = "flex";
    csvBtn.disabled = currentRows.length === 0;

    renderGrid();
    renderPagination();
  }

  function renderGrid() {
    if (currentColumns.length === 0) {
      dataGrid.innerHTML =
        '<tbody><tr><td style="padding:20px;color:var(--vscode-descriptionForeground)">Query returned no columns.</td></tr></tbody>';
      return;
    }

    // Determine base row number offset for pagination
    const rowOffset = currentTable ? currentPage * PAGE_SIZE : 0;

    let html = "<thead><tr>";
    // Row number header
    html += '<th class="row-num-header" style="min-width:40px;max-width:60px">#</th>';
    currentColumns.forEach((col, i) => {
      const w = calcColWidth(col);
      html +=
        '<th style="min-width:' +
        w +
        "px;width:" +
        w +
        'px;position:sticky;top:0">';
      html += '<span class="col-name">' + esc(col.name) + "</span>";
      html += '<span class="col-type">' + esc(col.type) + "</span>";
      html += '<div class="col-resizer" data-col="' + i + '"></div>';
      html += "</th>";
    });
    html += "</tr></thead><tbody>";

    currentRows.forEach((row, ri) => {
      html += "<tr>";
      html += '<td class="row-num">' + (rowOffset + ri + 1) + "</td>";
      row.forEach((cell, ci) => {
        if (cell === null || cell === undefined) {
          html += '<td class="cell-null">NULL</td>';
        } else {
          const cls = getCellClass(cell, currentColumns[ci]);
          html += "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + esc(String(cell)) + "</td>";
        }
      });
      html += "</tr>";
    });
    html += "</tbody>";

    dataGrid.innerHTML = html;
    initColumnResize();

    // Scroll to top on new result
    gridContainer.scrollTop = 0;
  }

  function renderPagination() {
    if (!currentTable || totalPages <= 1) {
      pagination.style.display = "none";
      return;
    }
    pagination.style.display = "flex";

    const start = currentPage * PAGE_SIZE + 1;
    const end = Math.min((currentPage + 1) * PAGE_SIZE, totalRows);

    pagination.innerHTML =
      '<span class="pagination-info">Rows ' +
      start.toLocaleString() +
      " \u2013 " +
      end.toLocaleString() +
      " of " +
      totalRows.toLocaleString() +
      "</span>" +
      '<div class="pagination-controls">' +
      '<button class="page-btn" id="prev-btn"' +
      (currentPage === 0 ? " disabled" : "") +
      ">\u2190 Prev</button>" +
      '<span class="page-indicator">Page ' +
      (currentPage + 1) +
      " of " +
      totalPages +
      "</span>" +
      '<button class="page-btn" id="next-btn"' +
      (currentPage >= totalPages - 1 ? " disabled" : "") +
      ">Next \u2192</button>" +
      "</div>";

    const prevBtn = $("prev-btn");
    const nextBtn = $("next-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (currentPage > 0) {
          currentPage--;
          showLoading();
          vscode.postMessage({
            type: "selectTable",
            table: currentTable,
            page: currentPage,
          });
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages - 1) {
          currentPage++;
          showLoading();
          vscode.postMessage({
            type: "selectTable",
            table: currentTable,
            page: currentPage,
          });
        }
      });
    }
  }

  // ─── CSV export ───

  function copyAsCsv() {
    if (!currentColumns.length || !currentRows.length) return;
    const header = currentColumns.map((c) => csvEsc(c.name)).join(",");
    const rows = currentRows.map((row) =>
      row
        .map((cell) =>
          csvEsc(cell === null || cell === undefined ? "" : String(cell))
        )
        .join(",")
    );
    const csv = [header, ...rows].join("\n");

    navigator.clipboard.writeText(csv).then(() => {
      const orig = csvBtn.textContent;
      csvBtn.textContent = "\u2713 Copied!";
      setTimeout(() => {
        csvBtn.textContent = orig;
      }, 1200);
    });
  }

  function csvEsc(str) {
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ─── Column resize ───

  function initColumnResize() {
    document.querySelectorAll(".col-resizer").forEach((resizer) => {
      resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = resizer.parentElement;
        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        resizer.classList.add("active");

        function onMove(ev) {
          const newWidth = Math.max(50, startWidth + (ev.pageX - startX));
          th.style.width = newWidth + "px";
          th.style.minWidth = newWidth + "px";
          th.style.maxWidth = newWidth + "px";
        }

        function onUp() {
          resizer.classList.remove("active");
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  // ─── Helpers ───

  function showError(message) {
    emptyState.style.display = "none";
    gridWrapper.style.display = "none";
    errorBanner.style.display = "block";
    errorBanner.textContent = message;
    pagination.style.display = "none";
    csvBtn.disabled = true;
    statusBar.innerHTML = "";
  }

  function clearError() {
    errorBanner.style.display = "none";
  }

  function showLoading() {
    loading.style.display = "flex";
  }

  function hideLoading() {
    loading.style.display = "none";
  }

  function calcColWidth(col) {
    const nameLen = (col.name || "").length;
    const typeLen = (col.type || "").length;
    const charW = 8;
    return Math.min(Math.max(Math.max(nameLen, typeLen) * charW + 36, 80), 300);
  }

  function getCellClass(value, col) {
    if (value === null || value === undefined) return "cell-null";
    const t = ((col && col.type) || "").toUpperCase();
    if (
      [
        "INTEGER",
        "BIGINT",
        "SMALLINT",
        "TINYINT",
        "FLOAT",
        "DOUBLE",
        "DECIMAL",
        "HUGEINT",
        "UBIGINT",
        "UINTEGER",
        "USMALLINT",
        "UTINYINT",
        "INT",
        "INT4",
        "INT8",
        "INT2",
        "REAL",
        "NUMERIC",
      ].some((n) => t.includes(n))
    ) {
      return "cell-number";
    }
    if (t === "BOOLEAN" || t === "BOOL") return "cell-bool";
    return "";
  }

  function formatNumber(n) {
    if (n < 0) return "?";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 10_000) return (n / 1_000).toFixed(1) + "K";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  function esc(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }
})();
