let queryViews = {};
let currentSchema = null;
let currentPage = 1;
let totalPages = 1;
let lastQueryContext = null;
let lastResultData = null;
let pageSizeOverridden = false;
const QUERY_STATE_KEY = 'sd_sma_query_page_state_v1';
const quickRangeButtonIds = ['btnRange1D', 'btnRange1W', 'btnRange1M', 'btnRange1Y'];

async function fetchJson(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

function saveQueryPageState() {
  const state = {
    group: document.getElementById('group').value || '',
    baselineTable: document.getElementById('baselineTable').value || '',
    viewName: document.getElementById('viewName').value || '',
    labelLang: document.getElementById('labelLang').value || 'zh',
    pageSize: document.getElementById('pageSize').value || '10',
    pageSizeOverridden,
    startTime: document.getElementById('startTime').value || '',
    endTime: document.getElementById('endTime').value || '',
    pageNumber: document.getElementById('pageNumber').value || '1',
    currentPage,
    totalPages,
    lastQueryContext,
    lastResultData,
  };
  localStorage.setItem(QUERY_STATE_KEY, JSON.stringify(state));
}

function loadSavedQueryPageState() {
  const raw = localStorage.getItem(QUERY_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toLocalDatetimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function setQuickRange(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  document.getElementById('startTime').value = toLocalDatetimeInputValue(start);
  document.getElementById('endTime').value = toLocalDatetimeInputValue(end);
  saveQueryPageState();
}

function enableButtonClickFeedback() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      btn.classList.remove('is-clicked');
      void btn.offsetWidth;
      btn.classList.add('is-clicked');
      setTimeout(() => btn.classList.remove('is-clicked'), 220);
    });
  }
}

function setQuickRangeActive(buttonId) {
  for (const id of quickRangeButtonIds) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-selected');
  }
  const active = document.getElementById(buttonId);
  if (active) active.classList.add('is-selected');
}

function clearQuickRangeActive() {
  for (const id of quickRangeButtonIds) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-selected');
  }
}

async function loadGroups() {
  const data = await fetchJson('/api/meta/groups');
  const sel = document.getElementById('group');
  sel.innerHTML = '';
  for (const g of data.groups || []) {
    const op = document.createElement('option');
    op.value = g;
    op.textContent = g;
    sel.appendChild(op);
  }
  if ((data.groups || []).length > 0) {
    await loadTables();
  }
}

async function loadTables() {
  const group = document.getElementById('group').value;
  if (!group) return;
  const data = await fetchJson('/api/meta/group-schema?group=' + encodeURIComponent(group));
  currentSchema = data;
  const sel = document.getElementById('baselineTable');
  sel.innerHTML = '';
  for (const t of data.tables || []) {
    const op = document.createElement('option');
    op.value = t;
    op.textContent = t;
    sel.appendChild(op);
  }
  if (data.baseline_table && (data.tables || []).includes(data.baseline_table)) {
    sel.value = data.baseline_table;
  }
  const hint = document.getElementById('schemaHint');
  if (data.consistent) {
    hint.textContent = `group=${group} 结构一致，共 ${data.tables.length} 张表`;
    hint.className = 'muted ok';
  } else {
    hint.textContent =
      `group=${group} 检测到表结构不一致，请选择基准表。当前基准：${data.baseline_table}`;
    hint.className = 'muted warn';
  }
}

async function loadViews() {
  const data = await fetchJson('/api/query/views');
  queryViews = data.views || {};
  const viewSel = document.getElementById('viewName');
  viewSel.innerHTML = '';
  for (const [name, view] of Object.entries(queryViews)) {
    const op = document.createElement('option');
    op.value = name;
    op.textContent = `${name} - ${view.title || name}`;
    viewSel.appendChild(op);
  }
  updateViewSummary();
}

function updateViewSummary() {
  const name = document.getElementById('viewName').value;
  const view = queryViews[name];
  if (!view) {
    document.getElementById('viewSummary').textContent = '';
    return;
  }
  const pageSize = view.page_size || 10;
  if (!pageSizeOverridden) {
    document.getElementById('pageSize').value = pageSize;
  }
  const columns = Array.isArray(view.columns) ? view.columns.join(', ') : '';
  document.getElementById('viewSummary').textContent =
    `view=${name}, title=${view.title || ''}, default_page_size=${pageSize}, columns=${columns}`;
}

async function runQuery() {
  await runQueryAtPage(1);
}

function getCurrentPageSize() {
  const value = Number(document.getElementById('pageSize').value || 10);
  return Math.max(1, Math.min(500, value));
}

function getCurrentQueryContext() {
  const baselineTable = document.getElementById('baselineTable').value;
  const viewName = document.getElementById('viewName').value;
  const group = document.getElementById('group').value;
  if (!group) return alert('请先选择 group');
  if (!baselineTable) return alert('请先选择基准表');
  if (!viewName) return alert('请先选择 view');
  return { baselineTable, viewName, group };
}

function updatePageInfo(total, page, pageSize) {
  totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  currentPage = Math.min(Math.max(page, 1), totalPages);
  document.getElementById('pageNumber').value = String(currentPage);
  document.getElementById('pageInfo').textContent =
    `总条数 ${total}，共 ${totalPages} 页，当前第 ${currentPage} 页`;
  saveQueryPageState();
}

async function runQueryAtPage(page) {
  const context = getCurrentQueryContext();
  if (!context) return;
  const { baselineTable, viewName, group } = context;
  const pageSize = getCurrentPageSize();
  const targetPage = Math.max(1, page);

  const payload = {
    view_name: viewName,
    group,
    table: baselineTable,
    page: targetPage,
    page_size: pageSize,
  };

  const start = document.getElementById('startTime').value;
  const end = document.getElementById('endTime').value;
  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    return alert('开始时间不能大于结束时间');
  }
  if (start) payload.start_time = new Date(start).toISOString();
  if (end) payload.end_time = new Date(end).toISOString();

  const data = await fetchJson('/api/history/by-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  renderTable(data.columns || [], data.display_columns || [], data.rows || []);
  document.getElementById('querySummary').textContent =
    `total=${data.total}, page=${data.page}, page_size=${data.page_size}`;
  updatePageInfo(data.total || 0, data.page || targetPage, data.page_size || pageSize);
  lastQueryContext = {
    ...context,
    start,
    end,
  };
  lastResultData = data;

  const warningParts = [];
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    warningParts.push(data.warnings.join(' | '));
  }
  if (Array.isArray(data.missing_columns) && data.missing_columns.length > 0) {
    warningParts.push(`missing_columns=${data.missing_columns.join(', ')}`);
  }
  document.getElementById('queryWarnings').textContent = warningParts.join(' | ');
  saveQueryPageState();
}

async function runLastQueryAtPage(page) {
  if (!lastQueryContext) return;
  const { baselineTable, viewName, group, start, end } = lastQueryContext;
  const pageSize = getCurrentPageSize();
  const targetPage = Math.max(1, page);

  const payload = {
    view_name: viewName,
    group,
    table: baselineTable,
    page: targetPage,
    page_size: pageSize,
  };
  if (start) payload.start_time = new Date(start).toISOString();
  if (end) payload.end_time = new Date(end).toISOString();

  const data = await fetchJson('/api/history/by-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  renderTable(data.columns || [], data.display_columns || [], data.rows || []);
  document.getElementById('querySummary').textContent =
    `total=${data.total}, page=${data.page}, page_size=${data.page_size}`;
  updatePageInfo(data.total || 0, data.page || targetPage, data.page_size || pageSize);
  lastResultData = data;
  saveQueryPageState();
}

function resolveHeader(displayMeta, lang) {
  const zh = displayMeta.label_zh || displayMeta.name;
  const en = displayMeta.label_en || displayMeta.name;
  if (lang === 'en') return en;
  if (lang === 'both') return `${zh} (${en})`;
  return zh;
}

function renderTable(columns, displayColumns, rows) {
  const table = document.getElementById('resultTable');
  table.innerHTML = '';
  const lang = document.getElementById('labelLang').value || 'zh';
  const displayMap = {};
  for (const item of displayColumns || []) {
    if (item && item.name) displayMap[item.name] = item;
  }

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    const meta = displayMap[c] || { name: c, label_en: c, label_zh: c };
    th.textContent = resolveHeader(meta, lang);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const c of columns) {
      const td = document.createElement('td');
      td.textContent = row[c] == null ? '' : String(row[c]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function restoreResultFromState(saved) {
  if (!saved || !saved.lastResultData) return;
  const data = saved.lastResultData;
  renderTable(data.columns || [], data.display_columns || [], data.rows || []);
  document.getElementById('querySummary').textContent =
    `total=${data.total}, page=${data.page}, page_size=${data.page_size}`;
  updatePageInfo(data.total || 0, data.page || 1, data.page_size || getCurrentPageSize());
  const warningParts = [];
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    warningParts.push(data.warnings.join(' | '));
  }
  if (Array.isArray(data.missing_columns) && data.missing_columns.length > 0) {
    warningParts.push(`missing_columns=${data.missing_columns.join(', ')}`);
  }
  document.getElementById('queryWarnings').textContent = warningParts.join(' | ');
}

async function restoreQueryPageState() {
  const saved = loadSavedQueryPageState();
  if (!saved) return;

  if (saved.labelLang) document.getElementById('labelLang').value = saved.labelLang;
  pageSizeOverridden = Boolean(saved.pageSizeOverridden);
  if (saved.pageSize) document.getElementById('pageSize').value = saved.pageSize;
  if (saved.startTime) document.getElementById('startTime').value = saved.startTime;
  if (saved.endTime) document.getElementById('endTime').value = saved.endTime;
  if (saved.pageNumber) document.getElementById('pageNumber').value = saved.pageNumber;
  if (saved.viewName && queryViews[saved.viewName]) {
    document.getElementById('viewName').value = saved.viewName;
    updateViewSummary();
  }

  if (saved.group) {
    const groupSel = document.getElementById('group');
    if (Array.from(groupSel.options).some(o => o.value === saved.group)) {
      groupSel.value = saved.group;
      await loadTables();
      if (saved.baselineTable) {
        const baseSel = document.getElementById('baselineTable');
        if (Array.from(baseSel.options).some(o => o.value === saved.baselineTable)) {
          baseSel.value = saved.baselineTable;
        }
      }
    }
  }
  lastQueryContext = saved.lastQueryContext || null;
  lastResultData = saved.lastResultData || null;
  restoreResultFromState(saved);
}

document.getElementById('btnRefreshGroups').addEventListener('click', () => {
  loadGroups().catch(err => alert(err.message));
});
document.getElementById('btnRunQuery').addEventListener('click', () => {
  runQuery().catch(err => alert(err.message));
});
document.getElementById('btnPrevPage').addEventListener('click', () => {
  if (!lastQueryContext) return;
  runLastQueryAtPage(Math.max(1, currentPage - 1)).catch(err => alert(err.message));
});
document.getElementById('btnNextPage').addEventListener('click', () => {
  if (!lastQueryContext) return;
  runLastQueryAtPage(Math.min(totalPages, currentPage + 1)).catch(err => alert(err.message));
});
document.getElementById('btnGoPage').addEventListener('click', () => {
  if (!lastQueryContext) return;
  const target = Number(document.getElementById('pageNumber').value || 1);
  runLastQueryAtPage(Math.min(totalPages, Math.max(1, target))).catch(err => alert(err.message));
});
document.getElementById('group').addEventListener('change', () => {
  loadTables().catch(err => alert(err.message));
  saveQueryPageState();
});
document.getElementById('baselineTable').addEventListener('change', async () => {
  const group = document.getElementById('group').value;
  const baselineTable = document.getElementById('baselineTable').value;
  if (!group || !baselineTable) return;
  await fetchJson('/api/config/group-baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, baseline_table: baselineTable }),
  });
  const hint = document.getElementById('schemaHint');
  hint.textContent = `已保存 group=${group} 的基准表为 ${baselineTable}`;
  saveQueryPageState();
});
document.getElementById('viewName').addEventListener('change', () => {
  updateViewSummary();
  saveQueryPageState();
});
document.getElementById('startTime').addEventListener('input', clearQuickRangeActive);
document.getElementById('endTime').addEventListener('input', clearQuickRangeActive);
document.getElementById('startTime').addEventListener('change', saveQueryPageState);
document.getElementById('endTime').addEventListener('change', saveQueryPageState);
document.getElementById('labelLang').addEventListener('change', saveQueryPageState);
document.getElementById('pageSize').addEventListener('change', () => {
  pageSizeOverridden = true;
  saveQueryPageState();
});
document.getElementById('btnRange1D').addEventListener('click', () => setQuickRange(1));
document.getElementById('btnRange1W').addEventListener('click', () => setQuickRange(7));
document.getElementById('btnRange1M').addEventListener('click', () => setQuickRange(30));
document.getElementById('btnRange1Y').addEventListener('click', () => setQuickRange(365));

document.getElementById('btnRange1D').addEventListener('click', () => setQuickRangeActive('btnRange1D'));
document.getElementById('btnRange1W').addEventListener('click', () => setQuickRangeActive('btnRange1W'));
document.getElementById('btnRange1M').addEventListener('click', () => setQuickRangeActive('btnRange1M'));
document.getElementById('btnRange1Y').addEventListener('click', () => setQuickRangeActive('btnRange1Y'));
document.getElementById('btnRange1D').addEventListener('click', saveQueryPageState);
document.getElementById('btnRange1W').addEventListener('click', saveQueryPageState);
document.getElementById('btnRange1M').addEventListener('click', saveQueryPageState);
document.getElementById('btnRange1Y').addEventListener('click', saveQueryPageState);

async function initQueryPage() {
  await loadViews();
  await loadGroups();
  enableButtonClickFeedback();
  const saved = loadSavedQueryPageState();
  if (!saved) {
    setQuickRange(1);
    setQuickRangeActive('btnRange1D');
    updatePageInfo(0, 1, getCurrentPageSize());
    saveQueryPageState();
    return;
  }
  await restoreQueryPageState();
}

initQueryPage().catch(err => alert(err.message));
