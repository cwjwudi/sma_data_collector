let queryViews = {};
let availableColumns = [];
let orderedColumns = [];
let columnLabels = {};
let currentSchema = null;
let pluginConfigData = { modules: {} };
const CONFIG_STATE_KEY = 'sd_sma_query_config_page_state_v1';

async function fetchJson(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

function saveConfigPageState() {
  const state = {
    viewName: document.getElementById('editViewName').value || '',
    group: document.getElementById('editGroupName').value || '',
    baselineTable: document.getElementById('editTableName').value || '',
    sortBy: document.getElementById('tableSortBy').value || '',
    sortDir: document.getElementById('tableSortDir').value || 'desc',
    pageSize: document.getElementById('tablePageSize').value || '50',
    orderedColumns,
    columnLabels,
    pluginModule: document.getElementById('pluginModule').value || '',
    pluginPageIndex: document.getElementById('pluginPageIndex').value || '1',
  };
  localStorage.setItem(CONFIG_STATE_KEY, JSON.stringify(state));
}

function loadSavedConfigPageState() {
  const raw = localStorage.getItem(CONFIG_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

function appendOption(select, value) {
  const op = document.createElement('option');
  op.value = value;
  op.textContent = value;
  select.appendChild(op);
}

function getSelectedValues(selectId) {
  const sel = document.getElementById(selectId);
  return Array.from(sel.selectedOptions).map(x => x.value);
}

async function loadViews() {
  const data = await fetchJson('/api/query/views');
  queryViews = data.views || {};
  const sel = document.getElementById('editViewName');
  sel.innerHTML = '';
  for (const [name, view] of Object.entries(queryViews)) {
    const op = document.createElement('option');
    op.value = name;
    op.textContent = `${name} - ${view.title || name}`;
    sel.appendChild(op);
  }
}

async function loadGroups() {
  const data = await fetchJson('/api/meta/groups');
  const sel = document.getElementById('editGroupName');
  sel.innerHTML = '';
  for (const g of data.groups || []) appendOption(sel, g);
  const pluginGroupSel = document.getElementById('pluginBindGroup');
  pluginGroupSel.innerHTML = '';
  appendOption(pluginGroupSel, '');
  for (const g of data.groups || []) appendOption(pluginGroupSel, g);
  if ((data.groups || []).length > 0) {
    await loadTables();
  }
}

async function loadTables() {
  const group = document.getElementById('editGroupName').value;
  if (!group) return;
  const data = await fetchJson('/api/meta/group-schema?group=' + encodeURIComponent(group));
  currentSchema = data;
  const sel = document.getElementById('editTableName');
  sel.innerHTML = '';
  for (const t of data.tables || []) appendOption(sel, t);
  if (data.baseline_table && (data.tables || []).includes(data.baseline_table)) {
    sel.value = data.baseline_table;
  }
  const hint = document.getElementById('schemaHint');
  if (data.consistent) {
    hint.textContent = `group=${group} 结构一致，共 ${data.tables.length} 张表`;
    hint.className = 'muted ok';
  } else {
    hint.textContent = `group=${group} 检测到结构不一致，请选择基准表。当前基准：${data.baseline_table}`;
    hint.className = 'muted warn';
  }
  saveConfigPageState();
}

function renderOrderedColumns() {
  const ordered = document.getElementById('orderedColumns');
  ordered.innerHTML = '';
  for (const c of orderedColumns) appendOption(ordered, c);
  renderLabelTable();
  saveConfigPageState();
}

function renderLabelTable() {
  const table = document.getElementById('columnLabelTable');
  table.innerHTML = '';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>字段名</th><th>English</th><th>中文</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const name of orderedColumns) {
    const labels = columnLabels[name] || { label_en: name, label_zh: name };
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${name}</td>` +
      `<td><input data-col="${name}" data-type="en" value="${labels.label_en || name}" /></td>` +
      `<td><input data-col="${name}" data-type="zh" value="${labels.label_zh || name}" /></td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function syncLabelInputsToState() {
  const inputs = document.querySelectorAll('#columnLabelTable input[data-col]');
  for (const input of inputs) {
    const name = input.getAttribute('data-col');
    const type = input.getAttribute('data-type');
    if (!columnLabels[name]) {
      columnLabels[name] = { label_en: name, label_zh: name };
    }
    if (type === 'en') columnLabels[name].label_en = input.value || name;
    if (type === 'zh') columnLabels[name].label_zh = input.value || name;
  }
  saveConfigPageState();
}

async function loadTableConfig() {
  const viewName = document.getElementById('editViewName').value;
  const group = document.getElementById('editGroupName').value;
  const baselineTable = document.getElementById('editTableName').value;
  if (!viewName || !group || !baselineTable) return;

  const meta = await fetchJson('/api/meta/columns?table=' + encodeURIComponent(baselineTable));
  availableColumns = meta.columns || [];
  const available = document.getElementById('availableColumns');
  available.innerHTML = '';
  for (const c of availableColumns) appendOption(available, c);

  const cfg = await fetchJson(
    '/api/config/query-group?view_name=' +
      encodeURIComponent(viewName) +
      '&group=' +
      encodeURIComponent(group),
  );

  orderedColumns = (cfg.columns || []).map(x => x.name);
  columnLabels = {};
  for (const c of cfg.columns || []) {
    columnLabels[c.name] = {
      label_en: c.label_en || c.name,
      label_zh: c.label_zh || c.name,
    };
  }

  const sortBy = document.getElementById('tableSortBy');
  sortBy.innerHTML = '';
  for (const c of availableColumns) appendOption(sortBy, c);
  if (availableColumns.includes(cfg.sort_by)) {
    sortBy.value = cfg.sort_by;
  } else if (availableColumns.length > 0) {
    sortBy.value = availableColumns[0];
  }
  document.getElementById('tableSortDir').value = cfg.sort_dir === 'asc' ? 'asc' : 'desc';
  document.getElementById('tablePageSize').value = Number(cfg.page_size || 50);
  renderOrderedColumns();
  if (cfg.baseline_table && availableColumns.length > 0) {
    const tableSel = document.getElementById('editTableName');
    if (Array.from(tableSel.options).some(x => x.value === cfg.baseline_table)) {
      tableSel.value = cfg.baseline_table;
    }
  }
  document.getElementById('columnEditorHint').textContent =
    `已加载: view=${viewName}, group=${group}, 基准表=${baselineTable}, columns=${orderedColumns.length}（当前为 group 级配置）`;
  saveConfigPageState();
}

function addColumns() {
  syncLabelInputsToState();
  const selected = getSelectedValues('availableColumns');
  for (const c of selected) {
    if (!orderedColumns.includes(c)) {
      orderedColumns.push(c);
      if (!columnLabels[c]) columnLabels[c] = { label_en: c, label_zh: c };
    }
  }
  renderOrderedColumns();
}

function removeColumns() {
  syncLabelInputsToState();
  const selected = new Set(getSelectedValues('orderedColumns'));
  orderedColumns = orderedColumns.filter(c => !selected.has(c));
  renderOrderedColumns();
}

function moveSelected(up) {
  syncLabelInputsToState();
  const selected = getSelectedValues('orderedColumns');
  if (selected.length === 0) return;
  const idxs = selected.map(v => orderedColumns.indexOf(v)).filter(i => i >= 0);
  if (up) {
    idxs.sort((a, b) => a - b);
    for (const idx of idxs) {
      if (idx > 0) {
        const tmp = orderedColumns[idx - 1];
        orderedColumns[idx - 1] = orderedColumns[idx];
        orderedColumns[idx] = tmp;
      }
    }
  } else {
    idxs.sort((a, b) => b - a);
    for (const idx of idxs) {
      if (idx < orderedColumns.length - 1) {
        const tmp = orderedColumns[idx + 1];
        orderedColumns[idx + 1] = orderedColumns[idx];
        orderedColumns[idx] = tmp;
      }
    }
  }
  renderOrderedColumns();
  const orderedSelect = document.getElementById('orderedColumns');
  for (const opt of orderedSelect.options) {
    opt.selected = selected.includes(opt.value);
  }
}

async function saveTableConfig() {
  syncLabelInputsToState();
  const viewName = document.getElementById('editViewName').value;
  const group = document.getElementById('editGroupName').value;
  const baselineTable = document.getElementById('editTableName').value;
  if (!viewName || !group || !baselineTable) return alert('请先选择 view、group、基准表');

  const payload = {
    view_name: viewName,
    group,
    baseline_table: baselineTable,
    sort_by: document.getElementById('tableSortBy').value || 'collection_time',
    sort_dir: document.getElementById('tableSortDir').value || 'desc',
    page_size: Number(document.getElementById('tablePageSize').value || 50),
    columns: orderedColumns.map(name => ({
      name,
      label_en: (columnLabels[name] || {}).label_en || name,
      label_zh: (columnLabels[name] || {}).label_zh || name,
    })),
  };

  await fetchJson('/api/config/query-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await fetchJson('/api/config/group-baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, baseline_table: baselineTable }),
  });
  document.getElementById('columnEditorHint').textContent =
    `已保存: view=${viewName}, group=${group}, 基准表=${baselineTable}, columns=${orderedColumns.length}（已写入 views.${viewName}.per_group.${group}）`;
  saveConfigPageState();
}

async function restoreConfigPageState() {
  const saved = loadSavedConfigPageState();
  if (!saved) return;
  if (saved.viewName && queryViews[saved.viewName]) {
    document.getElementById('editViewName').value = saved.viewName;
  }
  if (saved.group) {
    const groupSel = document.getElementById('editGroupName');
    if (Array.from(groupSel.options).some(o => o.value === saved.group)) {
      groupSel.value = saved.group;
      await loadTables();
      if (saved.baselineTable) {
        const tableSel = document.getElementById('editTableName');
        if (Array.from(tableSel.options).some(o => o.value === saved.baselineTable)) {
          tableSel.value = saved.baselineTable;
        }
      }
      await loadTableConfig();
      if (saved.sortBy) {
        const sortBySel = document.getElementById('tableSortBy');
        if (Array.from(sortBySel.options).some(o => o.value === saved.sortBy)) {
          sortBySel.value = saved.sortBy;
        }
      }
      if (saved.sortDir) {
        document.getElementById('tableSortDir').value = saved.sortDir === 'asc' ? 'asc' : 'desc';
      }
      if (saved.pageSize) {
        document.getElementById('tablePageSize').value = saved.pageSize;
      }
      if (Array.isArray(saved.orderedColumns)) {
        orderedColumns = saved.orderedColumns.filter(c => availableColumns.includes(c));
      }
      if (saved.columnLabels && typeof saved.columnLabels === 'object') {
        columnLabels = saved.columnLabels;
      }
      renderOrderedColumns();
    }
  }
  if (saved.pluginModule) {
    const sel = document.getElementById('pluginModule');
    if (Array.from(sel.options).some(o => o.value === saved.pluginModule)) {
      sel.value = saved.pluginModule;
    }
  }
  if (saved.pluginPageIndex) {
    document.getElementById('pluginPageIndex').value = saved.pluginPageIndex;
  }
  await loadPluginPageConfig();
}

document.getElementById('btnLoadTableConfig').addEventListener('click', () => {
  loadTableConfig().catch(err => alert(err.message));
});
document.getElementById('btnAddColumns').addEventListener('click', addColumns);
document.getElementById('btnRemoveColumns').addEventListener('click', removeColumns);
document.getElementById('btnMoveUp').addEventListener('click', () => moveSelected(true));
document.getElementById('btnMoveDown').addEventListener('click', () => moveSelected(false));
document.getElementById('btnSaveTableConfig').addEventListener('click', () => {
  saveTableConfig().catch(err => alert(err.message));
});
document.getElementById('editGroupName').addEventListener('change', () => {
  loadTables().catch(err => alert(err.message));
  saveConfigPageState();
});
document.getElementById('editViewName').addEventListener('change', saveConfigPageState);
document.getElementById('editTableName').addEventListener('change', saveConfigPageState);
document.getElementById('tableSortBy').addEventListener('change', saveConfigPageState);
document.getElementById('tableSortDir').addEventListener('change', saveConfigPageState);
document.getElementById('tablePageSize').addEventListener('change', saveConfigPageState);
document.getElementById('pluginModule').addEventListener('change', () => {
  saveConfigPageState();
  loadPluginPageConfig().catch(err => alert(err.message));
});
document.getElementById('pluginPageIndex').addEventListener('change', () => {
  saveConfigPageState();
  loadPluginPageConfig().catch(err => alert(err.message));
});
document.getElementById('pluginBindGroup').addEventListener('change', () => {
  const group = document.getElementById('pluginBindGroup').value || '';
  updatePluginGroupHint(group).catch(() => {});
  saveConfigPageState();
});

async function loadPluginConfig() {
  pluginConfigData = await fetchJson('/api/config/plugins');
  const modules = pluginConfigData.modules || {};
  const sel = document.getElementById('pluginModule');
  sel.innerHTML = '';
  for (const name of Object.keys(modules)) {
    appendOption(sel, name);
  }
  if (sel.options.length === 0) {
    appendOption(sel, 'alarm');
  }
  await loadPluginPageConfig();
  saveConfigPageState();
}

function ensurePluginModuleAndPage(moduleName, pageIndex) {
  pluginConfigData.modules = pluginConfigData.modules || {};
  if (!pluginConfigData.modules[moduleName]) {
    pluginConfigData.modules[moduleName] = {
      title: moduleName,
      view_name: 'table',
      bind_group: '',
      page_size: 10,
      pages: { '1': {}, '2': {}, '3': {}, '4': {}, '5': {} },
    };
  }
  const moduleCfg = pluginConfigData.modules[moduleName];
  moduleCfg.pages = moduleCfg.pages || {};
  for (const idx of ['1', '2', '3', '4', '5']) {
    if (!moduleCfg.pages[idx] || typeof moduleCfg.pages[idx] !== 'object') {
      moduleCfg.pages[idx] = {};
    }
  }
  if (!moduleCfg.pages[pageIndex]) moduleCfg.pages[pageIndex] = {};
}

async function updatePluginGroupHint(group) {
  const hint = document.getElementById('pluginGroupHint');
  if (!group) {
    hint.textContent = '未选择 bind_group';
    hint.className = 'muted';
    return;
  }
  try {
    const data = await fetchJson('/api/meta/group-schema?group=' + encodeURIComponent(group));
    const tableCount = Array.isArray(data.tables) ? data.tables.length : 0;
    const baseline = data.baseline_table || '-';
    if (data.consistent) {
      hint.textContent = `group=${group}，表数量=${tableCount}，基准表=${baseline}，结构一致`;
      hint.className = 'muted ok';
    } else {
      hint.textContent = `group=${group}，表数量=${tableCount}，基准表=${baseline}，检测到结构不一致`;
      hint.className = 'muted warn';
    }
  } catch (e) {
    hint.textContent = `group=${group} 信息读取失败：${e.message || e}`;
    hint.className = 'muted warn';
  }
}

async function loadPluginPageConfig() {
  const moduleName = document.getElementById('pluginModule').value;
  const pageIndex = document.getElementById('pluginPageIndex').value || '1';
  if (!moduleName) return;
  ensurePluginModuleAndPage(moduleName, pageIndex);
  const moduleCfg = pluginConfigData.modules[moduleName];
  const pageCfg = moduleCfg.pages[pageIndex] || {};

  const bindGroup = pageCfg.bind_group ?? moduleCfg.bind_group ?? '';
  document.getElementById('pluginEnabled').checked = pageCfg.enabled !== false;
  document.getElementById('pluginTitle').value = pageCfg.title ?? moduleCfg.title ?? `${moduleName}_${pageIndex}`;
  document.getElementById('pluginViewName').value = pageCfg.view_name ?? moduleCfg.view_name ?? 'table';
  document.getElementById('pluginPageSize').value = Number(pageCfg.page_size ?? moduleCfg.page_size ?? 10);
  document.getElementById('pluginBindGroup').value = bindGroup;
  await updatePluginGroupHint(bindGroup);
  document.getElementById('pluginConfigHint').textContent =
    `当前编辑: module=${moduleName}, page=${pageIndex}`;
}

async function savePluginPageConfig() {
  const moduleName = document.getElementById('pluginModule').value;
  const pageIndex = document.getElementById('pluginPageIndex').value || '1';
  if (!moduleName) {
    alert('请先选择模块');
    return;
  }
  ensurePluginModuleAndPage(moduleName, pageIndex);
  const moduleCfg = pluginConfigData.modules[moduleName];
  const pageCfg = moduleCfg.pages[pageIndex];

  pageCfg.enabled = document.getElementById('pluginEnabled').checked;
  pageCfg.title = document.getElementById('pluginTitle').value || `${moduleName}_${pageIndex}`;
  pageCfg.view_name = document.getElementById('pluginViewName').value || 'table';
  pageCfg.page_size = Number(document.getElementById('pluginPageSize').value || 10);
  pageCfg.bind_group = document.getElementById('pluginBindGroup').value || '';
  delete pageCfg.bind_table;

  moduleCfg.title = moduleCfg.title || moduleName;
  moduleCfg.view_name = moduleCfg.view_name || pageCfg.view_name;
  moduleCfg.page_size = moduleCfg.page_size || pageCfg.page_size;
  moduleCfg.bind_group = moduleCfg.bind_group || pageCfg.bind_group;
  delete moduleCfg.bind_table;

  await fetchJson('/api/config/plugins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pluginConfigData),
  });
  await updatePluginGroupHint(pageCfg.bind_group || '');
  document.getElementById('pluginConfigHint').textContent =
    `已保存: module=${moduleName}, page=${pageIndex}, bind_group=${pageCfg.bind_group || '-'}`;
  saveConfigPageState();
}

document.getElementById('btnLoadPluginPage').addEventListener('click', () => {
  loadPluginPageConfig().catch(err => alert(err.message));
});
document.getElementById('btnSavePluginPage').addEventListener('click', () => {
  savePluginPageConfig().catch(err => alert(err.message));
});
document.getElementById('pluginEnabled').addEventListener('change', saveConfigPageState);
document.getElementById('pluginTitle').addEventListener('input', saveConfigPageState);
document.getElementById('pluginViewName').addEventListener('change', saveConfigPageState);
document.getElementById('pluginPageSize').addEventListener('change', saveConfigPageState);

async function initConfigPage() {
  await loadViews();
  await loadGroups();
  enableButtonClickFeedback();
  await loadPluginConfig().catch(() => {});
  await restoreConfigPageState();
}

initConfigPage().catch(err => alert(err.message));
