(function () {
  let currentPage = 1;
  let totalPages = 1;
  let totalRecords = 0;
  let currentBinding = null;
  let lastStartIso = null;
  let lastEndIso = null;
  let selectedCursor = -1;
  let activePluginKey = "";
  const quickButtons = ["btnRange1D", "btnRange1W", "btnRange1M", "btnRange1Y"];
  let pluginStateKey = null;

  function fetchJson(url, opts) {
    return fetch(url, opts).then(async (resp) => {
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
      return data;
    });
  }

  function getPluginKeyFromPath() {
    const m = window.location.pathname.match(/\/plugins\/([^/]+)\.html$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function toInputTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      date.getFullYear() +
      "-" + pad(date.getMonth() + 1) +
      "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) +
      ":" + pad(date.getMinutes())
    );
  }

  function enableButtonClickFeedback() {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        btn.classList.remove("is-clicked");
        void btn.offsetWidth;
        btn.classList.add("is-clicked");
        setTimeout(() => btn.classList.remove("is-clicked"), 220);
      });
    }
  }

  function clampPage(value) {
    const v = Number(value || 1);
    const bounded = Math.min(Math.max(v, 1), Math.max(totalPages, 1));
    return Number.isFinite(bounded) ? bounded : 1;
  }

  function enableTouchPageNumberSpin(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let pointerActive = false;
    let startY = 0;
    let lastAppliedStep = 0;

    input.style.touchAction = "none";

    input.addEventListener("pointerdown", (e) => {
      pointerActive = true;
      startY = e.clientY;
      lastAppliedStep = 0;
      input.setPointerCapture(e.pointerId);
    });

    input.addEventListener("pointermove", (e) => {
      if (!pointerActive) return;
      const deltaY = startY - e.clientY;
      // 每 14px 变化 1 页，滑得越远变化越快
      const rawStep = deltaY / 14;
      const targetStep = rawStep > 0 ? Math.floor(rawStep) : Math.ceil(rawStep);
      if (targetStep === lastAppliedStep) return;

      const diff = targetStep - lastAppliedStep;
      lastAppliedStep = targetStep;

      const current = clampPage(input.value);
      input.value = String(clampPage(current + diff));
      e.preventDefault();
    });

    function endPointer(e) {
      if (!pointerActive) return;
      pointerActive = false;
      lastAppliedStep = 0;
      try {
        input.releasePointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }
    }

    input.addEventListener("pointerup", endPointer);
    input.addEventListener("pointercancel", endPointer);
    input.addEventListener("pointerleave", endPointer);
    input.addEventListener("change", () => {
      input.value = String(clampPage(input.value));
    });
  }

  function setQuickActive(id) {
    for (const btnId of quickButtons) {
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.remove("active");
    }
    const active = document.getElementById(id);
    if (active) active.classList.add("active");
    savePluginState();
  }

  function setQuickRange(days, buttonId) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    document.getElementById("startDate").value = toInputTime(start);
    document.getElementById("endDate").value = toInputTime(end);
    setQuickActive(buttonId);
    savePluginState();
  }

  function getActiveQuickButtonId() {
    for (const id of quickButtons) {
      const btn = document.getElementById(id);
      if (btn && btn.classList.contains("active")) return id;
    }
    return "";
  }

  function savePluginState() {
    if (!pluginStateKey) return;
    const tableSelector = document.getElementById("tableSelector");
    const state = {
      startDate: document.getElementById("startDate").value || "",
      endDate: document.getElementById("endDate").value || "",
      table: tableSelector ? tableSelector.value : "",
      currentPage,
      quickActive: getActiveQuickButtonId(),
      lastStartIso,
      lastEndIso,
    };
    localStorage.setItem(pluginStateKey, JSON.stringify(state));
  }

  function loadPluginState() {
    if (!pluginStateKey) return null;
    const raw = localStorage.getItem(pluginStateKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function updatePagerMeta(binding, warnings) {
    const infoParts = [
      `plugin=${binding.plugin_key}`,
      `group=${binding.resolved_group || "-"}`,
      `table=${binding.resolved_table || "-"}`,
      `total=${totalRecords}`,
      `pages=${totalPages}`,
      `current=${currentPage}`,
    ];
    if (Array.isArray(warnings) && warnings.length > 0) {
      infoParts.push(`warnings=${warnings.join(" | ")}`);
    }
    document.getElementById("meta").textContent = infoParts.join(" ; ");
    document.getElementById("pageNumber").value = String(currentPage);
    document.getElementById("totalPagesText").textContent = String(totalPages);
  }

  function renderTable(columns, displayColumns, rows) {
    const table = document.getElementById("resultTable");
    table.innerHTML = "";
    const displayMap = {};
    for (const item of displayColumns || []) {
      if (item && item.name) displayMap[item.name] = item;
    }

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    for (const c of columns || []) {
      const th = document.createElement("th");
      const meta = displayMap[c] || { label_zh: c, label_en: c };
      th.textContent = `${meta.label_zh || c} (${meta.label_en || c})`;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < (rows || []).length; rowIndex += 1) {
      const row = rows[rowIndex];
      const tr = document.createElement("tr");
      if (rowIndex === selectedCursor) {
        tr.classList.add("row-selected");
      }
      tr.addEventListener("click", () => {
        selectedCursor = rowIndex;
        renderTable(columns, displayColumns, rows);
        if (!activePluginKey) return;
        fetch(`/api/plugins/cursor/${encodeURIComponent(activePluginKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor: rowIndex }),
        }).catch(() => {});
      });
      for (const c of columns || []) {
        const td = document.createElement("td");
        td.textContent = row[c] == null ? "" : String(row[c]);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  async function run() {
    const pluginKey = getPluginKeyFromPath();
    if (!pluginKey) {
      document.getElementById("meta").textContent = "无法识别插件路径";
      return;
    }
    activePluginKey = pluginKey;

    pluginStateKey = `sd_sma_plugin_state_${pluginKey}`;
    currentBinding = await fetchJson(`/api/plugins/resolve/${encodeURIComponent(pluginKey)}`);
    const tableSelector = document.getElementById("tableSelector");
    tableSelector.innerHTML = "";
    const schemaReport = currentBinding.schema_report || null;
    const groupTables = schemaReport && Array.isArray(schemaReport.tables) ? schemaReport.tables : [];
    const defaultTable = currentBinding.resolved_table || "";
    for (const t of groupTables) {
      const op = document.createElement("option");
      op.value = t;
      const kind = schemaReport?.table_kinds?.[t] || "";
      op.textContent = kind === "fixed" ? `${t}（固定表）` : t;
      tableSelector.appendChild(op);
    }
    if (defaultTable && groupTables.includes(defaultTable)) {
      tableSelector.value = defaultTable;
    }
    if (groupTables.length === 0 && defaultTable) {
      const op = document.createElement("option");
      op.value = defaultTable;
      op.textContent = defaultTable;
      tableSelector.appendChild(op);
      tableSelector.value = defaultTable;
    }

    const savedState = loadPluginState();
    if (savedState) {
      if (savedState.startDate) document.getElementById("startDate").value = savedState.startDate;
      if (savedState.endDate) document.getElementById("endDate").value = savedState.endDate;
      if (savedState.table && Array.from(tableSelector.options).some(o => o.value === savedState.table)) {
        tableSelector.value = savedState.table;
      }
      if (savedState.quickActive && quickButtons.includes(savedState.quickActive)) {
        setQuickActive(savedState.quickActive);
      } else {
        setQuickActive("");
      }
      lastStartIso = savedState.lastStartIso || null;
      lastEndIso = savedState.lastEndIso || null;
    } else {
      setQuickRange(1, "btnRange1D");
    }

    async function query(page) {
      const targetPage = Math.max(1, page || 1);
      const startInput = document.getElementById("startDate");
      const endInput = document.getElementById("endDate");
      const payload = {
        page: targetPage,
        page_size: currentBinding.page_size || 10,
        table: tableSelector.value || undefined,
        cursor: -1,
      };
      // datetime-local 是本地时间，直接传递避免 UTC 偏移导致当天数据被过滤
      if (startInput.value) payload.start_time = startInput.value;
      if (endInput.value) payload.end_time = endInput.value;
      lastStartIso = payload.start_time || null;
      lastEndIso = payload.end_time || null;
      const data = await fetchJson(`/api/plugins/query/${encodeURIComponent(pluginKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      renderTable(data.columns || [], data.display_columns || [], data.rows || []);
      selectedCursor = -1;
      totalRecords = Number(data.total || 0);
      const pageSize = Number(data.page_size || currentBinding.page_size || 10);
      totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
      currentPage = Math.min(Math.max(Number(data.page || targetPage), 1), totalPages);
      updatePagerMeta(currentBinding, data.warnings || []);
      savePluginState();
    }

    async function queryCurrentPage(page) {
      const targetPage = Math.min(Math.max(page, 1), totalPages);
      const payload = {
        page: targetPage,
        page_size: currentBinding.page_size || 10,
        table: tableSelector.value || undefined,
        cursor: -1,
      };
      if (lastStartIso) payload.start_time = lastStartIso;
      if (lastEndIso) payload.end_time = lastEndIso;
      const data = await fetchJson(`/api/plugins/query/${encodeURIComponent(pluginKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      renderTable(data.columns || [], data.display_columns || [], data.rows || []);
      selectedCursor = -1;
      totalRecords = Number(data.total || 0);
      const pageSize = Number(data.page_size || currentBinding.page_size || 10);
      totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
      currentPage = Math.min(Math.max(Number(data.page || targetPage), 1), totalPages);
      updatePagerMeta(currentBinding, data.warnings || []);
      savePluginState();
    }

    document.getElementById("btnGo").addEventListener("click", () => {
      query(1).catch((e) => (document.getElementById("meta").textContent = e.message));
    });
    tableSelector.addEventListener("change", () => {
      savePluginState();
      query(1).catch((e) => (document.getElementById("meta").textContent = e.message));
    });
    document.getElementById("btnRange1D").addEventListener("click", () => setQuickRange(1, "btnRange1D"));
    document.getElementById("btnRange1W").addEventListener("click", () => setQuickRange(7, "btnRange1W"));
    document.getElementById("btnRange1M").addEventListener("click", () => setQuickRange(30, "btnRange1M"));
    document.getElementById("btnRange1Y").addEventListener("click", () => setQuickRange(365, "btnRange1Y"));
    document.getElementById("startDate").addEventListener("input", () => {
      setQuickActive("");
      savePluginState();
    });
    document.getElementById("endDate").addEventListener("input", () => {
      setQuickActive("");
      savePluginState();
    });
    document.getElementById("btnPrevPage").addEventListener("click", () => {
      queryCurrentPage(currentPage - 1).catch((e) => (document.getElementById("meta").textContent = e.message));
    });
    document.getElementById("btnNextPage").addEventListener("click", () => {
      queryCurrentPage(currentPage + 1).catch((e) => (document.getElementById("meta").textContent = e.message));
    });
    document.getElementById("btnGoPage").addEventListener("click", () => {
      const target = Number(document.getElementById("pageNumber").value || 1);
      queryCurrentPage(target).catch((e) => (document.getElementById("meta").textContent = e.message));
    });

    enableTouchPageNumberSpin("pageNumber");
    enableButtonClickFeedback();
    const startPage = savedState && Number(savedState.currentPage || 1) > 1
      ? Number(savedState.currentPage || 1)
      : 1;
    query(startPage).catch((e) => (document.getElementById("meta").textContent = e.message));
  }

  run().catch((e) => {
    document.getElementById("meta").textContent = e.message;
  });
})();
