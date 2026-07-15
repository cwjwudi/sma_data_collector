let queryViews = {};
let currentPage = 1;
let totalPages = 1;
let hasMore = false;
let currentCursor = null;
let nextCursor = null;
let cursorStack = [];
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
    table: document.getElementById('tableName').value || '',
    viewName: document.getElementById('viewName').value || '',
    labelLang: document.getElementById('labelLang').value || 'zh',
    pageSize: document.getElementById('pageSize').value || '10',
    pageSizeOverridden,
    startTime: document.getElementById('startTime').value || '',
    endTime: document.getElementById('endTime').value || '',
    batchCode: document.getElementById('batchCode').value || '',
    combineMode: document.getElementById('combineMode').value || 'and',
    pageNumber: document.getElementById('pageNumber').value || '1',
    currentPage,
    totalPages,
    hasMore,
    currentCursor,
    nextCursor,
    cursorStack,
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

async function loadGroupSchemaHint() {
  const group = document.getElementById('group').value;
  if (!group) return;
  const data = await fetchJson('/api/meta/group-schema?group=' + encodeURIComponent(group));
  const hint = document.getElementById('schemaHint');
  if (data.consistent) {
    hint.textContent = `group=${group} 已配置，可查询；当前基准表=${data.baseline_table}，共 ${data.tables.length} 张表`;
    hint.className = 'muted ok';
  } else {
    hint.textContent = `group=${group} 表结构不一致，将按已配置基准表 ${data.baseline_table} 查询`;
    hint.className = 'muted warn';
  }
}

async function loadTablesForCurrentGroup(preferredTable) {
  const group = document.getElementById('group').value;
  const tableSel = document.getElementById('tableName');
  tableSel.innerHTML = '';
  if (!group) return;

  const data = await fetchJson('/api/meta/tables?group=' + encodeURIComponent(group));
  const tables = Array.isArray(data.tables) ? data.tables : [];
  for (const table of tables) {
    const op = document.createElement('option');
    op.value = table;
    const kind = data.table_kinds?.[table] || '';
    op.textContent = kind === 'fixed' ? `${table}（固定表）` : table;
    tableSel.appendChild(op);
  }
  if (preferredTable && tables.includes(preferredTable)) {
    tableSel.value = preferredTable;
  }
}

async function loadGroupsForCurrentView(preferredGroup) {
  const viewName = document.getElementById('viewName').value;
  const hint = document.getElementById('schemaHint');
  if (!viewName) {
    const sel = document.getElementById('group');
    sel.innerHTML = '';
    hint.textContent = '暂无可用 view';
    hint.className = 'muted warn';
    return;
  }
  const view = queryViews[viewName] || {};
  const perGroup = view.per_group && typeof view.per_group === 'object' ? view.per_group : {};
  const configuredGroups = Object.keys(perGroup);
  const sel = document.getElementById('group');
  sel.innerHTML = '';
  for (const g of configuredGroups) {
    const op = document.createElement('option');
    op.value = g;
    op.textContent = g;
    sel.appendChild(op);
  }
  if (configuredGroups.length === 0) {
    hint.textContent = `view=${viewName} 暂无已配置 group，请先到配置页保存 group 配置`;
    hint.className = 'muted warn';
    return;
  }
  if (preferredGroup && configuredGroups.includes(preferredGroup)) {
    sel.value = preferredGroup;
  }
  await loadGroupSchemaHint();
  await loadTablesForCurrentGroup();
}

async function loadViews() {
  const currentView = document.getElementById('viewName').value;
  const currentGroup = document.getElementById('group').value;
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
  if (currentView && queryViews[currentView]) {
    viewSel.value = currentView;
  }
  updateViewSummary();
  await loadGroupsForCurrentView(currentGroup);
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
  const viewName = document.getElementById('viewName').value;
  const group = document.getElementById('group').value;
  const table = document.getElementById('tableName').value;
  if (!viewName) return alert('请先选择 view');
  if (!group) return alert('请先选择已配置 group');
  return { viewName, group, table };
}

function updatePageInfo(total, page, pageSize, more = false) {
  hasMore = Boolean(more);
  totalPages = total == null
    ? Math.max(1, page + (hasMore ? 1 : 0))
    : Math.max(1, Math.ceil((total || 0) / pageSize));
  currentPage = Math.max(page, 1);
  document.getElementById('pageNumber').value = String(currentPage);
  document.getElementById('btnPrevPage').disabled = currentPage <= 1;
  document.getElementById('btnNextPage').disabled = !hasMore;
  document.getElementById('pageInfo').textContent = total == null
    ? `当前第 ${currentPage} 页，每页 ${pageSize} 条${hasMore ? '，还有更多' : '，已到末页'}`
    : `总条数 ${total}，共 ${totalPages} 页，当前第 ${currentPage} 页`;
  saveQueryPageState();
}

async function runQueryAtPage(page) {
  const context = getCurrentQueryContext();
  if (!context) return;
  const { viewName, group, table } = context;
  const pageSize = getCurrentPageSize();
  const targetPage = Math.max(1, page);
  currentCursor = null;
  nextCursor = null;
  cursorStack = [];

  const payload = {
    view_name: viewName,
    group,
    page: targetPage,
    page_size: pageSize,
    pagination_mode: 'cursor',
    include_total: false,
    combine_mode: document.getElementById('combineMode').value || 'and',
  };
  if (table) payload.table = table;

  const start = document.getElementById('startTime').value;
  const end = document.getElementById('endTime').value;
  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    return alert('开始时间不能大于结束时间');
  }
  // datetime-local 是本地时间，直接传递避免 toISOString() 产生时区偏移
  if (start) payload.start_time = start;
  if (end) payload.end_time = end;
  const batchCode = document.getElementById('batchCode').value.trim();
  if (batchCode) payload.batch_code = batchCode;

  const data = await fetchJson('/api/history/by-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  renderTable(data.columns || [], data.display_columns || [], data.rows || []);
  nextCursor = data.next_cursor || null;
  document.getElementById('querySummary').textContent =
    `page=${data.page}, page_size=${data.page_size}, has_more=${Boolean(data.has_more)}`;
  updatePageInfo(data.total, data.page || targetPage, data.page_size || pageSize, data.has_more);
  lastQueryContext = {
    ...context,
    start,
    end,
    batchCode,
    combineMode: payload.combine_mode,
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
  const { viewName, group, start, end, batchCode, combineMode } = lastQueryContext;
  const table = lastQueryContext.table || '';
  const pageSize = getCurrentPageSize();
  const targetPage = Math.max(1, page);
  let requestedCursor = currentCursor;
  const proposedStack = [...cursorStack];
  if (targetPage > currentPage) {
    if (!hasMore || !nextCursor) return;
    proposedStack.push(currentCursor);
    requestedCursor = nextCursor;
  } else if (targetPage < currentPage) {
    requestedCursor = proposedStack.length ? proposedStack.pop() : null;
  } else {
    return;
  }

  const payload = {
    view_name: viewName,
    group,
    page: targetPage,
    page_size: pageSize,
    pagination_mode: 'cursor',
    include_total: false,
    combine_mode: combineMode || 'and',
  };
  if (table) payload.table = table;
  if (start) payload.start_time = start;
  if (end) payload.end_time = end;
  if (batchCode) payload.batch_code = batchCode;
  if (requestedCursor) payload.cursor = requestedCursor;

  const data = await fetchJson('/api/history/by-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  renderTable(data.columns || [], data.display_columns || [], data.rows || []);
  currentCursor = requestedCursor;
  cursorStack = proposedStack;
  nextCursor = data.next_cursor || null;
  document.getElementById('querySummary').textContent =
    `page=${targetPage}, page_size=${data.page_size}, has_more=${Boolean(data.has_more)}`;
  updatePageInfo(data.total, targetPage, data.page_size || pageSize, data.has_more);
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
    `page=${data.page || 1}, page_size=${data.page_size}, has_more=${Boolean(data.has_more)}`;
  updatePageInfo(data.total, data.page || 1, data.page_size || getCurrentPageSize(), data.has_more);
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
  if (saved.batchCode) document.getElementById('batchCode').value = saved.batchCode;
  if (saved.combineMode) document.getElementById('combineMode').value = saved.combineMode;
  if (saved.pageNumber) document.getElementById('pageNumber').value = saved.pageNumber;
  if (saved.viewName && queryViews[saved.viewName]) {
    document.getElementById('viewName').value = saved.viewName;
  }
  updateViewSummary();
  await loadGroupsForCurrentView(saved.group || '');
  await loadTablesForCurrentGroup(saved.table || '');

  lastQueryContext = saved.lastQueryContext || null;
  lastResultData = saved.lastResultData || null;
  hasMore = Boolean(saved.hasMore);
  currentCursor = saved.currentCursor || null;
  nextCursor = saved.nextCursor || null;
  cursorStack = Array.isArray(saved.cursorStack) ? saved.cursorStack : [];
  restoreResultFromState(saved);
}

document.getElementById('btnRefreshGroups').addEventListener('click', () => {
  loadViews().catch(err => alert(err.message));
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
document.getElementById('group').addEventListener('change', () => {
  Promise.all([loadGroupSchemaHint(), loadTablesForCurrentGroup()])
    .then(() => saveQueryPageState())
    .catch(err => alert(err.message));
});
document.getElementById('tableName').addEventListener('change', saveQueryPageState);
document.getElementById('viewName').addEventListener('change', () => {
  const selectedGroup = document.getElementById('group').value || '';
  loadGroupsForCurrentView(selectedGroup)
    .then(() => {
      updateViewSummary();
      saveQueryPageState();
    })
    .catch(err => alert(err.message));
});
document.getElementById('startTime').addEventListener('input', clearQuickRangeActive);
document.getElementById('endTime').addEventListener('input', clearQuickRangeActive);
document.getElementById('startTime').addEventListener('change', saveQueryPageState);
document.getElementById('endTime').addEventListener('change', saveQueryPageState);
document.getElementById('batchCode').addEventListener('change', saveQueryPageState);
document.getElementById('combineMode').addEventListener('change', saveQueryPageState);
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
  enableButtonClickFeedback();
  const saved = loadSavedQueryPageState();
  if (!saved) {
    setQuickRange(1);
    setQuickRangeActive('btnRange1D');
    updatePageInfo(null, 1, getCurrentPageSize(), false);
    saveQueryPageState();
    return;
  }
  await restoreQueryPageState();
}

initQueryPage().catch(err => alert(err.message));
