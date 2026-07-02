let queryViews = {};
let availableColumns = [];
let orderedColumns = [];
let columnLabels = {};
let currentSchema = null;
let pluginConfigData = { modules: {} };
const CONFIG_STATE_KEY = 'sd_sma_query_config_page_state_v1';
let currentConfigProfile = '';

function getAppSettingsPayload() {
  return {
    database: {
      type: document.getElementById('appDbType').value || 'mysql',
      name: document.getElementById('appDbName').value.trim(),
      host: document.getElementById('appDbHost').value.trim(),
      port: Number(document.getElementById('appDbPort').value || 0),
      username: document.getElementById('appDbUsername').value.trim(),
      password: document.getElementById('appDbPassword').value,
    },
    query_limits: {
      requests_per_minute: Number(document.getElementById('appRequestsPerMinute').value || 0),
      default_window_hours: Number(document.getElementById('appDefaultWindowHours').value || 24),
      max_window_hours: Number(document.getElementById('appMaxWindowHours').value || 168),
    },
  };
}

function fillAppSettingsForm(data) {
  const database = data.database || {};
  const queryLimits = data.query_limits || {};
  document.getElementById('appDbType').value = database.type || 'mysql';
  document.getElementById('appDbName').value = database.name || '';
  document.getElementById('appDbHost').value = database.host || '';
  document.getElementById('appDbPort').value = Number(database.port || 3306);
  document.getElementById('appDbUsername').value = database.username || '';
  document.getElementById('appDbPassword').value = database.password || '';
  document.getElementById('appRequestsPerMinute').value = Number(queryLimits.requests_per_minute || 120);
  document.getElementById('appDefaultWindowHours').value = Number(queryLimits.default_window_hours || 24);
  document.getElementById('appMaxWindowHours').value = Number(queryLimits.max_window_hours || 168);
}

function getOpcuaPayload() {
  return {
    endpoint_url: document.getElementById('appOpcuaEndpoint').value.trim(),
    username: document.getElementById('appOpcuaUsername').value.trim(),
    password: document.getElementById('appOpcuaPassword').value,
  };
}

function fillOpcuaForm(data) {
  const settings = data || {};
  document.getElementById('appOpcuaEndpoint').value = settings.endpoint_url || '';
  document.getElementById('appOpcuaUsername').value = settings.username || '';
  document.getElementById('appOpcuaPassword').value = settings.password || '';
}

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
    timeField: document.getElementById('tableTimeField').value || '',
    sortBy: document.getElementById('tableSortBy').value || '',
    sortDir: document.getElementById('tableSortDir').value || 'desc',
    pageSize: document.getElementById('tablePageSize').value || '50',
    orderedColumns,
    columnLabels,
    pluginModule: document.getElementById('pluginModule').value || '',
    pluginPageIndex: document.getElementById('pluginPageIndex').value || '1',
    configProfile: document.getElementById('configProfileSelect').value || currentConfigProfile || '',
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

function populateFieldSelectors(columns, preferredTimeField, preferredSortBy) {
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const timeField = document.getElementById('tableTimeField');
  const sortBy = document.getElementById('tableSortBy');
  timeField.innerHTML = '';
  sortBy.innerHTML = '';

  for (const column of normalizedColumns) {
    appendOption(timeField, column);
    appendOption(sortBy, column);
  }

  if (normalizedColumns.includes(preferredTimeField)) {
    timeField.value = preferredTimeField;
  } else if (normalizedColumns.includes('collection_time')) {
    timeField.value = 'collection_time';
  } else if (normalizedColumns.length > 0) {
    timeField.value = normalizedColumns[0];
  }

  if (normalizedColumns.includes(preferredSortBy)) {
    sortBy.value = preferredSortBy;
  } else if (normalizedColumns.includes(timeField.value)) {
    sortBy.value = timeField.value;
  } else if (normalizedColumns.length > 0) {
    sortBy.value = normalizedColumns[0];
  }
}

async function loadColumnsForTable(tableName, preferredTimeField, preferredSortBy) {
  if (!tableName) {
    availableColumns = [];
    document.getElementById('availableColumns').innerHTML = '';
    populateFieldSelectors([], '', '');
    return;
  }

  const meta = await fetchJson('/api/meta/columns?table=' + encodeURIComponent(tableName));
  availableColumns = meta.columns || [];
  const available = document.getElementById('availableColumns');
  available.innerHTML = '';
  for (const c of availableColumns) appendOption(available, c);
  populateFieldSelectors(availableColumns, preferredTimeField, preferredSortBy);
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

async function loadAppSettings() {
  const [data, opcuaData] = await Promise.all([
    fetchJson('/api/config/app-settings'),
    fetchJson('/api/config/opcua').catch(() => ({ endpoint_url: '', username: '', password: '' })),
  ]);
  fillAppSettingsForm(data || {});
  fillOpcuaForm(opcuaData || {});
  document.getElementById('appSettingsHint').textContent =
    '已加载基础设定与 OPC UA 连接（保存基础设定时一并写入）';
}

async function loadConfigProfiles() {
  const data = await fetchJson('/api/config/profiles');
  currentConfigProfile = data.active || '';
  const sel = document.getElementById('configProfileSelect');
  sel.innerHTML = '';
  for (const profile of data.profiles || []) {
    const op = document.createElement('option');
    op.value = profile.filename;
    op.textContent = profile.name && profile.name !== profile.filename
      ? `${profile.name} (${profile.filename})`
      : profile.filename;
    sel.appendChild(op);
  }
  if (currentConfigProfile && hasOption(sel, currentConfigProfile)) {
    sel.value = currentConfigProfile;
  }
  document.getElementById('configProfileHint').textContent =
    currentConfigProfile ? `当前加载: ${currentConfigProfile}` : '未找到可用 config';
}

async function switchConfigProfile() {
  const filename = document.getElementById('configProfileSelect').value;
  if (!filename) return;
  const result = await fetchJson('/api/config/profiles/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  currentConfigProfile = result.active || filename;
  await reloadActiveConfigData(`已加载 config: ${currentConfigProfile}`);
}

async function refreshConfigProfiles() {
  await loadConfigProfiles();
  document.getElementById('configProfileHint').textContent =
    currentConfigProfile ? `config 列表已刷新，当前加载: ${currentConfigProfile}` : '未找到可用 config';
}

async function createConfigProfile() {
  const filename = await showNameModal(suggestConfigBaseName());
  const hint = document.getElementById('configProfileHint');
  if (!filename) {
    hint.textContent = '已取消新建';
    return;
  }

  const result = await fetchJson('/api/config/profiles/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  currentConfigProfile = result.active || filename;
  await reloadActiveConfigData(`已新建配置文件: ${currentConfigProfile}`);
}

function suggestConfigBaseName() {
  const existing = new Set(
    Array.from(document.getElementById('configProfileSelect').options).map(option =>
      option.value.replace(/\.json$/i, ''),
    ),
  );
  let base = 'new_config';
  let idx = 2;
  while (existing.has(base)) {
    base = `new_config_${idx}`;
    idx += 1;
  }
  return base;
}

async function deleteCurrentConfigProfile() {
  const filename = (document.getElementById('configProfileSelect').value || currentConfigProfile || '').trim();
  const hint = document.getElementById('configProfileHint');
  if (!filename) {
    hint.textContent = '没有可删除的 config';
    return;
  }

  const confirmed = await showConfirmModal({
    title: '删除确认（1/2）',
    message: `确认删除配置文件 ${filename} 吗？`,
  });
  if (!confirmed) {
    hint.textContent = '已取消删除';
    return;
  }

  const confirmedAgain = await showConfirmModal({
    title: '删除确认（2/2）',
    message: `二次确认：删除后不可恢复，是否继续删除 ${filename}？`,
  });
  if (!confirmedAgain) {
    hint.textContent = '已取消删除';
    return;
  }

  const result = await fetchJson('/api/config/profiles/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  currentConfigProfile = result.active || '';
  await reloadActiveConfigData(`已删除 config: ${filename}；当前加载: ${currentConfigProfile || '-'}`);
}

async function reloadActiveConfigData(message) {
  localStorage.removeItem(CONFIG_STATE_KEY);
  queryViews = {};
  availableColumns = [];
  orderedColumns = [];
  columnLabels = {};
  currentSchema = null;
  pluginConfigData = { modules: {} };
  await loadConfigProfiles();
  await loadAppSettings();
  await loadViews();
  await loadGroups();
  await refreshMetadataFromCurrentDatabase();
  await loadPluginConfig().catch(() => {});
  document.getElementById('configProfileHint').textContent = message;
}

function showNameModal(defaultBaseName = 'new_config') {
  return new Promise(resolve => {
    const overlay = document.getElementById('name-modal-overlay');
    const input = document.getElementById('name-modal-input');
    const hint = document.getElementById('name-modal-hint');
    const cancelBtn = document.getElementById('name-modal-cancel');
    const confirmBtn = document.getElementById('name-modal-confirm');

    hint.textContent = '文件后缀固定为 .json';
    input.value = defaultBaseName;
    overlay.style.display = 'flex';
    input.focus();
    input.select();

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      input.removeEventListener('keydown', onKeyDown);
    };

    const onCancel = () => {
      cleanup();
      resolve('');
    };

    const onConfirm = () => {
      const raw = input.value.trim().replace(/\.json$/i, '');
      if (!raw) {
        hint.textContent = '文件名不能为空';
        return;
      }
      if (/[\\/:*?"<>|]/.test(raw)) {
        hint.textContent = '文件名包含非法字符 \\ / : * ? " < > |';
        return;
      }
      cleanup();
      resolve(`${raw}.json`);
    };

    const onOverlayClick = event => {
      if (event.target === overlay) {
        onCancel();
      }
    };

    const onKeyDown = event => {
      if (event.key === 'Enter') {
        onConfirm();
      } else if (event.key === 'Escape') {
        onCancel();
      }
    };

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    input.addEventListener('keydown', onKeyDown);
  });
}

function showConfirmModal({ title, message }) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-modal-overlay');
    const modalTitle = document.getElementById('confirm-modal-title');
    const modalMessage = document.getElementById('confirm-modal-message');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const confirmBtn = document.getElementById('confirm-modal-confirm');

    modalTitle.textContent = title || '确认';
    modalMessage.textContent = message || '';
    overlay.style.display = 'flex';

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onOverlayClick = event => {
      if (event.target === overlay) {
        onCancel();
      }
    };

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
  });
}

function hasOption(select, value) {
  return Array.from(select.options).some(option => option.value === value);
}

function clearGroupConfigEditor() {
  currentSchema = null;
  availableColumns = [];
  orderedColumns = [];
  columnLabels = {};
  document.getElementById('editTableName').innerHTML = '';
  document.getElementById('availableColumns').innerHTML = '';
  document.getElementById('tableTimeField').innerHTML = '';
  document.getElementById('tableSortBy').innerHTML = '';
  document.getElementById('schemaHint').textContent = '当前数据库下没有可用 group，请先检查连接设置。';
  document.getElementById('schemaHint').className = 'muted warn';
  document.getElementById('columnEditorHint').textContent = '';
  renderOrderedColumns();
}

async function refreshMetadataFromCurrentDatabase() {
  const viewSel = document.getElementById('editViewName');
  const groupSel = document.getElementById('editGroupName');
  const tableSel = document.getElementById('editTableName');
  const pluginGroupSel = document.getElementById('pluginBindGroup');
  const previousView = viewSel.value;
  const previousGroup = groupSel.value;
  const previousTable = tableSel.value;
  const previousPluginGroup = pluginGroupSel.value;

  await loadViews();
  if (previousView && hasOption(viewSel, previousView)) {
    viewSel.value = previousView;
  }

  await loadGroups();

  if ((groupSel.options || []).length === 0) {
    clearGroupConfigEditor();
    pluginGroupSel.value = '';
    await updatePluginGroupHint('');
    saveConfigPageState();
    return;
  }

  if (previousGroup && hasOption(groupSel, previousGroup)) {
    groupSel.value = previousGroup;
    await loadTables();
    if (previousTable && hasOption(tableSel, previousTable)) {
      tableSel.value = previousTable;
      await loadColumnsForTable(
        previousTable,
        document.getElementById('tableTimeField').value,
        document.getElementById('tableSortBy').value,
      );
    }
  }

  if (groupSel.value && tableSel.value) {
    await loadTableConfig();
  } else {
    clearGroupConfigEditor();
  }

  if (previousPluginGroup && hasOption(pluginGroupSel, previousPluginGroup)) {
    pluginGroupSel.value = previousPluginGroup;
  } else {
    pluginGroupSel.value = pluginGroupSel.options.length > 0 ? pluginGroupSel.options[0].value : '';
  }
  await updatePluginGroupHint(pluginGroupSel.value || '');
  saveConfigPageState();
}

async function saveAppSettings(options = {}) {
  const { refreshMetadata = false, successMessage } = options;
  const payload = getAppSettingsPayload();
  const opcuaPayload = getOpcuaPayload();
  const result = await fetchJson('/api/config/app-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const opcuaResult = await fetchJson('/api/config/opcua', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opcuaPayload),
  });
  fillAppSettingsForm((result && result.settings) || payload);
  fillOpcuaForm(opcuaResult || opcuaPayload);
  if (refreshMetadata) {
    await refreshMetadataFromCurrentDatabase();
  }
  const baseMessage =
    successMessage ||
    (refreshMetadata
      ? '基础设定与 OPC UA 已保存，数据库已重连，Group 与列已按当前数据库刷新'
      : '基础设定与 OPC UA 已保存；如需刷新 Group 与列，请点击“连接数据库”');
  document.getElementById('appSettingsHint').textContent = baseMessage;
  return result;
}

async function connectDatabase() {
  document.getElementById('appSettingsHint').textContent = '正在保存基础设定并连接数据库...';
  await saveAppSettings({
    refreshMetadata: false,
    successMessage: '基础设定已保存，正在验证数据库连接...',
  });
  const check = await fetchJson('/api/db/check');
  await refreshMetadataFromCurrentDatabase();
  document.getElementById('appSettingsHint').textContent =
    `数据库连接成功（${check.database || '-'}），Group 与列已刷新；OPC UA 连接已随基础设定保存`;
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
  await loadColumnsForTable(sel.value, document.getElementById('tableTimeField').value, document.getElementById('tableSortBy').value);
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

  await loadColumnsForTable(baselineTable, '', '');

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

  populateFieldSelectors(availableColumns, cfg.time_field, cfg.sort_by);
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
    time_field: document.getElementById('tableTimeField').value || 'collection_time',
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

async function deleteGroupConfig() {
  const viewName = document.getElementById('editViewName').value;
  const group = document.getElementById('editGroupName').value;
  const hint = document.getElementById('columnEditorHint');
  if (!viewName || !group) return alert('请先选择 view、group');

  const confirmed = await showConfirmModal({
    title: '删除确认（1/2）',
    message: `确认删除当前 group 配置 view=${viewName}, group=${group} 吗？`,
  });
  if (!confirmed) {
    hint.textContent = '已取消删除';
    return;
  }

  const confirmedAgain = await showConfirmModal({
    title: '删除确认（2/2）',
    message: `二次确认：删除后不可恢复，是否继续删除 view=${viewName}, group=${group}？`,
  });
  if (!confirmedAgain) {
    hint.textContent = '已取消删除';
    return;
  }

  const result = await fetchJson(
    '/api/config/query-group?view_name=' +
      encodeURIComponent(viewName) +
      '&group=' +
      encodeURIComponent(group),
    { method: 'DELETE' },
  );
  orderedColumns = [];
  columnLabels = {};
  renderOrderedColumns();
  document.getElementById('columnEditorHint').textContent =
    result.status === 'deleted'
      ? `已删除: view=${viewName}, group=${group}（views.${viewName}.per_group.${group}）`
      : `未找到配置: view=${viewName}, group=${group}`;
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
      if (saved.timeField) {
        const timeFieldSel = document.getElementById('tableTimeField');
        if (Array.from(timeFieldSel.options).some(o => o.value === saved.timeField)) {
          timeFieldSel.value = saved.timeField;
        }
      }
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
document.getElementById('btnReloadConfigProfile').addEventListener('click', () => {
  switchConfigProfile().catch(err => alert(err.message));
});
document.getElementById('btnRefreshConfigProfiles').addEventListener('click', () => {
  refreshConfigProfiles().catch(err => alert(err.message));
});
document.getElementById('btnCreateConfigProfile').addEventListener('click', () => {
  createConfigProfile().catch(err => alert(err.message));
});
document.getElementById('btnDeleteConfigProfile').addEventListener('click', () => {
  deleteCurrentConfigProfile().catch(err => alert(err.message));
});
document.getElementById('configProfileSelect').addEventListener('change', () => {
  switchConfigProfile().catch(err => alert(err.message));
});
document.getElementById('btnSaveAppSettings').addEventListener('click', () => {
  saveAppSettings().catch(err => alert(err.message));
});
document.getElementById('btnConnectDatabase').addEventListener('click', () => {
  connectDatabase().catch(err => alert(err.message));
});
document.getElementById('btnAddColumns').addEventListener('click', addColumns);
document.getElementById('btnRemoveColumns').addEventListener('click', removeColumns);
document.getElementById('btnMoveUp').addEventListener('click', () => moveSelected(true));
document.getElementById('btnMoveDown').addEventListener('click', () => moveSelected(false));
document.getElementById('btnSaveTableConfig').addEventListener('click', () => {
  saveTableConfig().catch(err => alert(err.message));
});
document.getElementById('btnDeleteGroupConfig').addEventListener('click', () => {
  deleteGroupConfig().catch(err => alert(err.message));
});
document.getElementById('editGroupName').addEventListener('change', () => {
  loadTables().catch(err => alert(err.message));
  saveConfigPageState();
});
document.getElementById('editViewName').addEventListener('change', saveConfigPageState);
document.getElementById('editTableName').addEventListener('change', () => {
  loadColumnsForTable(
    document.getElementById('editTableName').value,
    document.getElementById('tableTimeField').value,
    document.getElementById('tableSortBy').value,
  ).catch(err => alert(err.message));
  saveConfigPageState();
});
document.getElementById('tableTimeField').addEventListener('change', saveConfigPageState);
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
  refreshPluginOpcuaWritebackTable().catch(() => {});
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

function buildOpcuaWritebackPreview(writebackCfg) {
  return {
    cursor: writebackCfg?.cursor || '',
    columns: writebackCfg?.columns && typeof writebackCfg.columns === 'object' ? writebackCfg.columns : {},
  };
}

function renderPluginOpcuaColumnTable(columns, writebackCfg) {
  const table = document.getElementById('pluginOpcuaColumnTable');
  table.innerHTML = '';
  const boundColumns = writebackCfg?.columns && typeof writebackCfg.columns === 'object' ? writebackCfg.columns : {};
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>回写</th><th>字段名</th><th>显示名</th><th>OPC NodeId</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const col of columns) {
    const name = col.name;
    const labelZh = col.label_zh || col.label_en || name;
    const enabled = Object.prototype.hasOwnProperty.call(boundColumns, name);
    const nodeId = enabled ? boundColumns[name] : '';
    const tr = document.createElement('tr');
    tr.setAttribute('data-col', name);
    tr.innerHTML =
      `<td><input type="checkbox" class="opcua-col-enabled"${enabled ? ' checked' : ''} /></td>` +
      `<td>${name}</td>` +
      `<td>${labelZh}</td>` +
      `<td><input type="text" class="opcua-col-nodeid field-wide" value="${escapeHtmlAttr(nodeId)}" placeholder="ns=6;s=::DataRev:..." /></td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function capturePluginOpcuaMappings() {
  const cursorEl = document.getElementById('pluginOpcuaCursor');
  const cursor = cursorEl ? cursorEl.value.trim() : '';
  const columns = {};
  const rows = document.querySelectorAll('#pluginOpcuaColumnTable tbody tr[data-col]');
  for (const tr of rows) {
    const col = tr.getAttribute('data-col');
    const enabled = tr.querySelector('.opcua-col-enabled')?.checked;
    const nodeId = tr.querySelector('.opcua-col-nodeid')?.value.trim() || '';
    columns[col] = { enabled: !!enabled, nodeId };
  }
  return { cursor, columns };
}

function mergeCapturedMappingsToWriteback(captured) {
  const columns = {};
  for (const [name, info] of Object.entries(captured.columns || {})) {
    if (info.enabled && info.nodeId) {
      columns[name] = info.nodeId;
    }
  }
  return {
    cursor: captured.cursor || '',
    columns,
  };
}

function collectPluginOpcuaWriteback() {
  const captured = capturePluginOpcuaMappings();
  const writeback = mergeCapturedMappingsToWriteback(captured);
  if (Object.keys(writeback.columns).length === 0) {
    return null;
  }
  if (!writeback.cursor) {
    delete writeback.cursor;
  }
  return writeback;
}

async function loadPluginOpcuaWritebackTable(viewName, bindGroup, writebackCfg) {
  const hint = document.getElementById('pluginOpcuaWritebackHint');
  const table = document.getElementById('pluginOpcuaColumnTable');
  const cursorEl = document.getElementById('pluginOpcuaCursor');
  table.innerHTML = '';
  cursorEl.value = writebackCfg?.cursor || '';

  if (!bindGroup) {
    hint.textContent = '请先选择 bind_group；列清单来自该 group 在「Group 与列」中的配置。';
    hint.className = 'muted warn';
    return;
  }

  try {
    const cfg = await fetchJson(
      '/api/config/query-group?view_name=' +
        encodeURIComponent(viewName) +
        '&group=' +
        encodeURIComponent(bindGroup),
    );
    const columns = cfg.columns || [];
    if (columns.length === 0) {
      hint.textContent = `view=${viewName}, group=${bindGroup} 尚未配置列，请先在「Group 与列」中保存该 group。`;
      hint.className = 'muted warn';
      return;
    }
    renderPluginOpcuaColumnTable(columns, writebackCfg);
    const boundCount = Object.keys(writebackCfg?.columns || {}).length;
    hint.textContent = `已加载 ${columns.length} 列，当前绑定 ${boundCount} 列回写。`;
    hint.className = 'muted ok';
  } catch (e) {
    hint.textContent = `无法加载 group 列配置：${e.message || e}`;
    hint.className = 'muted warn';
  }
}

async function refreshPluginOpcuaWritebackTable() {
  const captured = capturePluginOpcuaMappings();
  const viewName = document.getElementById('pluginViewName').value || 'table';
  const bindGroup = document.getElementById('pluginBindGroup').value || '';
  const writebackCfg = mergeCapturedMappingsToWriteback(captured);
  await loadPluginOpcuaWritebackTable(viewName, bindGroup, writebackCfg);
  renderPluginOpcuaFeedbackEditor();
}

function renderPluginOpcuaFeedbackEditor() {
  const writeback = collectPluginOpcuaWriteback();
  const payload = buildOpcuaWritebackPreview(writeback || { cursor: document.getElementById('pluginOpcuaCursor').value.trim(), columns: {} });
  document.getElementById('pluginOpcuaFeedbackJson').value = JSON.stringify(payload, null, 2);
  document.getElementById('pluginOpcuaFeedbackHint').textContent =
    '只读预览；保存当前页配置时以上方表单为准。';
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

  const viewName = pageCfg.view_name ?? moduleCfg.view_name ?? 'table';
  const writebackCfg = pageCfg.opcua_writeback || { cursor: '', columns: {} };
  await loadPluginOpcuaWritebackTable(viewName, bindGroup, writebackCfg);
  renderPluginOpcuaFeedbackEditor();

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

  const writeback = collectPluginOpcuaWriteback();
  if (writeback && Object.keys(writeback.columns).length > 0) {
    pageCfg.opcua_writeback = writeback;
  } else {
    delete pageCfg.opcua_writeback;
  }

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
document.getElementById('pluginViewName').addEventListener('change', () => {
  refreshPluginOpcuaWritebackTable().catch(() => {});
  saveConfigPageState();
});
document.getElementById('pluginPageSize').addEventListener('change', saveConfigPageState);
document.getElementById('pluginOpcuaCursor').addEventListener('input', () => {
  renderPluginOpcuaFeedbackEditor();
  saveConfigPageState();
});
document.getElementById('pluginOpcuaAdvanced').addEventListener('toggle', event => {
  if (event.target.open) {
    renderPluginOpcuaFeedbackEditor();
  }
});
document.getElementById('pluginOpcuaColumnTable').addEventListener('change', event => {
  if (event.target.matches('.opcua-col-enabled, .opcua-col-nodeid')) {
    renderPluginOpcuaFeedbackEditor();
    saveConfigPageState();
  }
});
document.getElementById('pluginOpcuaColumnTable').addEventListener('input', event => {
  if (event.target.matches('.opcua-col-nodeid')) {
    renderPluginOpcuaFeedbackEditor();
    saveConfigPageState();
  }
});

async function initConfigPage() {
  await loadConfigProfiles();
  await loadAppSettings();
  await loadViews();
  await loadGroups();
  enableButtonClickFeedback();
  await loadPluginConfig().catch(() => {});
  await restoreConfigPageState();
}

initConfigPage().catch(err => alert(err.message));
