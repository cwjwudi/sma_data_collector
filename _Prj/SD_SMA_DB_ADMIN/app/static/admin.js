const STATE_KEY = 'sd_sma_db_admin_state_v2';
let activeJobId = '';
let pollTimer = null;
let defaultOutputDir = '';
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const confirmModalConfirm = document.getElementById('confirm-modal-confirm');

async function fetchJson(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
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

function setHint(id, text, cls = 'muted') {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = cls;
}

function showConfirmModal({ title, message, confirmText = '确认执行' }) {
  if (
    !confirmModalOverlay ||
    !confirmModalTitle ||
    !confirmModalMessage ||
    !confirmModalCancel ||
    !confirmModalConfirm
  ) {
    console.error('Confirm modal elements are missing.');
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    const oldConfirmText = confirmModalConfirm.textContent;

    const close = result => {
      confirmModalOverlay.style.display = 'none';
      confirmModalConfirm.textContent = oldConfirmText;
      confirmModalCancel.removeEventListener('click', cancel);
      confirmModalConfirm.removeEventListener('click', confirm);
      confirmModalOverlay.removeEventListener('click', clickOutside);
      document.removeEventListener('keydown', keydown);
      resolve(result);
    };
    const cancel = () => close(false);
    const confirm = () => close(true);
    const clickOutside = event => {
      if (event.target === confirmModalOverlay) close(false);
    };
    const keydown = event => {
      if (event.key === 'Escape') close(false);
    };

    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalConfirm.textContent = confirmText;
    confirmModalOverlay.style.display = 'flex';
    confirmModalCancel.addEventListener('click', cancel);
    confirmModalConfirm.addEventListener('click', confirm);
    confirmModalOverlay.addEventListener('click', clickOutside);
    document.addEventListener('keydown', keydown);
    confirmModalConfirm.focus();
  });
}

function appendOption(select, value, label = '') {
  const op = document.createElement('option');
  op.value = value;
  op.textContent = label || value;
  select.appendChild(op);
}

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 'B';
  for (const next of units) {
    value /= 1024;
    unit = next;
    if (value < 1024) break;
  }
  const digits = value >= 100 || unit === 'KB' ? 0 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}

function sizedLabel(name, sizeBytes) {
  if (sizeBytes == null || sizeBytes === '') return String(name || '');
  return `${name} (${formatBytes(sizeBytes)})`;
}

function normalizeSizedItems(items) {
  return (items || []).map(item => {
    if (typeof item === 'string') return { name: item, size_bytes: null };
    return {
      name: String(item?.name || ''),
      size_bytes: item?.size_bytes == null ? null : Number(item.size_bytes),
    };
  }).filter(item => item.name);
}

function hasOption(select, value) {
  return Array.from(select.options).some(option => option.value === value);
}

function setSelectValueIfPresent(id, value) {
  const sel = document.getElementById(id);
  if (value && hasOption(sel, value)) sel.value = value;
}

function updateQuickChipState() {
  const host = String(document.getElementById('dbHost').value).trim();
  const port = String(document.getElementById('dbPort').value).trim();
  const username = String(document.getElementById('dbUsername').value).trim();
  for (const chip of document.querySelectorAll('.quick-chip')) {
    const matchesHost = !chip.dataset.connHost || chip.dataset.connHost === host;
    const matchesPort = !chip.dataset.connPort || chip.dataset.connPort === port;
    const matchesUser = !chip.dataset.connUser || chip.dataset.connUser === username;
    chip.classList.toggle('is-selected', matchesHost && matchesPort && matchesUser);
  }
}

function applyConnectionShortcut(chip) {
  if (chip.dataset.connHost) document.getElementById('dbHost').value = chip.dataset.connHost;
  if (chip.dataset.connPort) document.getElementById('dbPort').value = chip.dataset.connPort;
  if (chip.dataset.connUser) document.getElementById('dbUsername').value = chip.dataset.connUser;
  saveState();
  updateQuickChipState();
  setHint('connectionHint', '已套用快捷连接参数，请输入密码后测试连接。');
}

function togglePasswordVisibility() {
  const input = document.getElementById('dbPassword');
  const btn = document.getElementById('btnTogglePassword');
  const shouldShow = input.type === 'password';
  input.type = shouldShow ? 'text' : 'password';
  btn.textContent = shouldShow ? '隐藏' : '显示';
  btn.setAttribute('aria-label', shouldShow ? '隐藏密码' : '显示密码');
  input.focus();
}

function clearPassword() {
  const input = document.getElementById('dbPassword');
  input.value = '';
  input.focus();
}

function getConnectionPayload() {
  return {
    engine: 'mysql',
    host: document.getElementById('dbHost').value.trim() || '127.0.0.1',
    port: Number(document.getElementById('dbPort').value || 3306),
    username: document.getElementById('dbUsername').value.trim(),
    password: document.getElementById('dbPassword').value,
    database: document.getElementById('databaseSelect').value || '',
  };
}

function getSelectedValue(id, message) {
  const value = document.getElementById(id).value;
  if (!value) throw new Error(message);
  return value;
}

function getExportDatabase() {
  return getSelectedValue('databaseSelect', '请先选择数据库');
}

function getExportTable() {
  return getSelectedValue('tableSelect', '请先选择表');
}

function getOutputDir() {
  return document.getElementById('outputDir').value.trim();
}

function saveState() {
  const state = {
    host: document.getElementById('dbHost').value,
    port: document.getElementById('dbPort').value,
    username: document.getElementById('dbUsername').value,
    database: document.getElementById('databaseSelect').value,
    table: document.getElementById('tableSelect').value,
    restoreDatabase: document.getElementById('restoreDatabaseSelect').value,
    importDatabase: document.getElementById('importDatabaseSelect').value,
    importTable: document.getElementById('importTableSelect').value,
    outputDir: document.getElementById('outputDir').value,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadSavedState() {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadConfig() {
  const config = await fetchJson('/api/config');
  const saved = loadSavedState();
  const conn = { ...(config.default_connection || {}), ...(saved || {}) };
  defaultOutputDir = config.backup_dir || '';
  document.getElementById('dbHost').value = conn.host || '127.0.0.1';
  document.getElementById('dbPort').value = Number(conn.port || 3306);
  document.getElementById('dbUsername').value = conn.username || '';
  document.getElementById('dbPassword').value = conn.password || '';
  document.getElementById('outputDir').value =
    saved?.outputDir || config.last_output_dir || defaultOutputDir;
  setHint('connectionHint', `默认导出目录: ${defaultOutputDir || '-'}`);
  updateQuickChipState();
}

async function testConnection() {
  const data = await fetchJson('/api/connect/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getConnectionPayload()),
  });
  if (data.ok) {
    setHint('connectionHint', `连接成功: ${data.engine}, version=${data.version || data.path || '-'}`, 'muted ok');
  } else {
    setHint('connectionHint', `连接失败: ${data.message || '-'}`, 'muted warn');
  }
}

function populateDatabaseSelects(databases) {
  const items = normalizeSizedItems(databases);
  for (const id of ['databaseSelect', 'restoreDatabaseSelect', 'importDatabaseSelect']) {
    const sel = document.getElementById(id);
    const previous = sel.value;
    sel.innerHTML = '';
    for (const item of items) appendOption(sel, item.name, sizedLabel(item.name, item.size_bytes));
    if (previous && hasOption(sel, previous)) sel.value = previous;
  }
}

async function loadDatabases(preferred = {}) {
  const data = await fetchJson('/api/databases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getConnectionPayload()),
  });
  const databases = data.databases || [];
  populateDatabaseSelects(databases);
  setSelectValueIfPresent('databaseSelect', preferred.database || '');
  setSelectValueIfPresent('restoreDatabaseSelect', preferred.restoreDatabase || preferred.database || '');
  setSelectValueIfPresent('importDatabaseSelect', preferred.importDatabase || preferred.database || '');
  setHint('objectHint', `数据库数量: ${databases.length}`);
  saveState();
  if (document.getElementById('databaseSelect').value) await loadExportTables(preferred.table || '');
  if (document.getElementById('importDatabaseSelect').value) await loadImportTables(preferred.importTable || '');
}

async function fetchTables(database) {
  const data = await fetchJson('/api/tables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection: getConnectionPayload(), database }),
  });
  return data.tables || [];
}

async function loadExportTables(preferredTable = '') {
  const database = getExportDatabase();
  const tables = normalizeSizedItems(await fetchTables(database));
  const sel = document.getElementById('tableSelect');
  const previous = preferredTable || sel.value;
  sel.innerHTML = '';
  for (const item of tables) appendOption(sel, item.name, sizedLabel(item.name, item.size_bytes));
  if (previous && hasOption(sel, previous)) sel.value = previous;
  setHint('objectHint', `数据库 ${database}，表数量: ${tables.length}`);
  saveState();
}

async function loadImportTables(preferredTable = '') {
  const database = getSelectedValue('importDatabaseSelect', '请先选择导入目标数据库');
  const tables = normalizeSizedItems(await fetchTables(database));
  const sel = document.getElementById('importTableSelect');
  const previous = preferredTable || sel.value;
  sel.innerHTML = '';
  for (const item of tables) appendOption(sel, item.name, sizedLabel(item.name, item.size_bytes));
  if (previous && hasOption(sel, previous)) sel.value = previous;
  saveState();
}

/** Re-fetch database/table sizes while keeping current selections. */
async function refreshSizedCatalog() {
  const preferred = {
    database: document.getElementById('databaseSelect').value || '',
    restoreDatabase: document.getElementById('restoreDatabaseSelect').value || '',
    importDatabase: document.getElementById('importDatabaseSelect').value || '',
    table: document.getElementById('tableSelect').value || '',
    importTable: document.getElementById('importTableSelect').value || '',
  };
  await loadDatabases(preferred);
}

async function chooseOutputFolder() {
  setHint('backupHint', '正在打开文件夹选择窗口...');
  const data = await fetchJson('/api/folder-dialog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_dir: getOutputDir() || defaultOutputDir }),
  });
  if (data.selected) {
    document.getElementById('outputDir').value = data.selected;
    saveState();
    setHint('backupHint', `已选择导出目录: ${data.selected}`, 'muted ok');
  } else {
    setHint('backupHint', '已取消选择导出目录', 'muted');
  }
}

async function startBackup() {
  const database = getExportDatabase();
  const data = await fetchJson('/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: getConnectionPayload(),
      database,
      output_dir: getOutputDir(),
    }),
  });
  watchJob(data.job.id);
  setHint('backupHint', `已开始整库 SQL 备份，输出目录: ${getOutputDir() || defaultOutputDir}`, 'muted ok');
}

async function startTableBackup() {
  const database = getExportDatabase();
  const table = getExportTable();
  const data = await fetchJson('/api/backup-table', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: getConnectionPayload(),
      database,
      table,
      output_dir: getOutputDir(),
    }),
  });
  watchJob(data.job.id);
  setHint('backupHint', `已开始单表 SQL 备份: ${database}.${table}`, 'muted ok');
}

async function startCsvExport() {
  const database = getExportDatabase();
  const table = getExportTable();
  const data = await fetchJson('/api/export-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: getConnectionPayload(),
      database,
      table,
      output_dir: getOutputDir(),
    }),
  });
  watchJob(data.job.id);
  setHint('backupHint', `已开始 CSV 导出（适合小数据）: ${database}.${table}`, 'muted ok');
}

async function requireDoubleConfirm(kind, target) {
  const first = await showConfirmModal({
    title: `${kind}确认（1/2）`,
    message: `${kind} 将写入数据库：${target}。是否继续？`,
    confirmText: '继续',
  });
  if (!first) return false;
  return showConfirmModal({
    title: `${kind}确认（2/2）`,
    message: `二次确认：${kind} 执行后可能覆盖或追加数据，确定继续？`,
    confirmText: '确认执行',
  });
}

async function requestConfirmationToken(action, database, table = '') {
  const data = await fetchJson('/api/confirmations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, database, table }),
  });
  return data.token;
}

async function registerLocalFile(kind) {
  setHint('importHint', `正在打开${kind === 'csv' ? 'CSV' : 'SQL'}文件选择窗口...`);
  const data = await fetchJson('/api/register-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, initial_dir: getOutputDir() || defaultOutputDir }),
  });
  if (!data.selected) {
    setHint('importHint', '已取消登记本地文件', 'muted');
    return;
  }
  if (kind === 'csv') {
    await loadServerCsvExports();
    setHint('importHint', `已登记 CSV: ${data.filename}`, 'muted ok');
  } else {
    await loadServerBackups();
    setHint('importHint', `已登记 SQL: ${data.filename}`, 'muted ok');
  }
}

async function loadServerBackups() {
  const data = await fetchJson('/api/backups');
  const select = document.getElementById('serverBackupSelect');
  const previous = select.value;
  select.innerHTML = '';
  for (const backup of data.backups || []) {
    const option = document.createElement('option');
    option.value = backup.filename;
    const scope = backup.scope === 'table' && backup.table
      ? `表 ${backup.database || ''}.${backup.table}`
      : (backup.scope === 'external' ? '外部登记' : '整库');
    option.textContent = `${backup.filename} [${scope}] (${formatBytes(backup.size_bytes)})`;
    select.appendChild(option);
  }
  if (previous && hasOption(select, previous)) select.value = previous;
}

async function loadServerCsvExports() {
  const data = await fetchJson('/api/csv-exports');
  const select = document.getElementById('serverCsvSelect');
  const previous = select.value;
  select.innerHTML = '';
  for (const item of data.exports || []) {
    const option = document.createElement('option');
    option.value = item.filename;
    const origin = item.table ? `${item.database || ''}.${item.table}` : '外部登记';
    option.textContent = `${item.filename} [${origin}] (${formatBytes(item.size_bytes)})`;
    select.appendChild(option);
  }
  if (previous && hasOption(select, previous)) select.value = previous;
}

async function startRestoreServerBackup() {
  const database = getSelectedValue('restoreDatabaseSelect', '请先选择恢复目标数据库');
  const filename = getSelectedValue('serverBackupSelect', '没有可恢复的已完成备份');
  if (!(await requireDoubleConfirm('恢复服务器备份', `${filename} → ${database}`))) return;
  const confirmationToken = await requestConfirmationToken('restore-backup', database);
  const data = await fetchJson('/api/restore-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: getConnectionPayload(),
      database,
      filename,
      confirmation_token: confirmationToken,
    }),
  });
  watchJob(data.job.id);
  setHint('importHint', `已开始校验并恢复: ${filename} → ${database}`, 'muted warn');
}

function syncForceImportTruncate() {
  const forceEl = document.getElementById('forceCsvImport');
  const truncateEl = document.getElementById('truncateBeforeImport');
  if (forceEl.checked) {
    truncateEl.checked = true;
    truncateEl.disabled = true;
  } else {
    truncateEl.disabled = false;
  }
}

async function startImportServerCsv() {
  const database = getSelectedValue('importDatabaseSelect', '请先选择导入目标数据库');
  const table = getSelectedValue('importTableSelect', '请先选择导入目标表');
  const filename = getSelectedValue('serverCsvSelect', '没有可导入的已导出 CSV');
  const force = document.getElementById('forceCsvImport').checked;
  if (force) syncForceImportTruncate();
  if (!(await requireDoubleConfirm('导入 CSV', `${filename} → ${database}.${table}`))) {
    setHint('importHint', '已取消 CSV 导入', 'muted');
    return;
  }
  const confirmationToken = await requestConfirmationToken('import-server-csv', database, table);
  const data = await fetchJson('/api/import-server-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection: getConnectionPayload(),
      database,
      table,
      filename,
      force,
      truncate: force || document.getElementById('truncateBeforeImport').checked,
      confirmation_token: confirmationToken,
    }),
  });
  watchJob(data.job.id);
  setHint('importHint', `已开始 CSV 导入: ${filename} → ${database}.${table}`, 'muted warn');
}

function statusClass(status) {
  if (status === 'done') return 'status-done';
  if (status === 'failed') return 'status-failed';
  return 'status-running';
}

function formatDuration(seconds) {
  if (seconds == null) return '-';
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function renderProgress(job) {
  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  return (
    `<div class="progress-wrap" title="${progress}%">` +
    `<div class="progress-bar" style="width: ${progress}%"></div>` +
    `</div><span class="progress-label">${progress}%</span>`
  );
}

function renderJobs(jobs) {
  const table = document.getElementById('jobsTable');
  table.innerHTML = '';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>状态</th><th>进度</th><th>任务</th><th>耗时</th><th>预计剩余</th><th>输出/结果</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const job of jobs) {
    const tr = document.createElement('tr');
    const status = job.status || 'running';
    const result = job.result && job.result.path
      ? `${job.result.path}${job.result.size_bytes ? ` (${job.result.size_bytes} bytes)` : ''}`
      : (job.error || job.phase || '');
    const statusCell = document.createElement('td');
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = `job-link status-pill ${statusClass(status)}`;
    statusButton.dataset.jobId = String(job.id || '');
    statusButton.textContent = status;
    statusCell.appendChild(statusButton);
    if (status === 'running') {
      statusCell.appendChild(document.createTextNode(' '));
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'job-cancel';
      cancelButton.textContent = '取消';
      cancelButton.addEventListener('click', async event => {
        event.stopPropagation();
        if (!(await showConfirmModal({ title: '取消任务', message: `确定取消 ${job.title || job.id}？`, confirmText: '确认取消' }))) return;
        await fetchJson(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' });
        await refreshJobs();
      });
      statusCell.appendChild(cancelButton);
    }
    tr.appendChild(statusCell);

    const progressCell = document.createElement('td');
    progressCell.innerHTML = renderProgress(job);
    tr.appendChild(progressCell);
    for (const text of [
      job.title || job.id,
      formatDuration(job.elapsed_seconds),
      formatDuration(job.eta_seconds),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = String(text || '');
      tr.appendChild(cell);
    }
    const resultCell = document.createElement('td');
    const resultText = document.createElement('span');
    resultText.textContent = String(result || '');
    resultCell.appendChild(resultText);
    if (job.result && job.result.download_url) {
      resultCell.appendChild(document.createTextNode(' '));
      const downloadLink = document.createElement('a');
      downloadLink.href = job.result.download_url;
      downloadLink.textContent = '下载';
      downloadLink.setAttribute('download', job.result.filename || '');
      resultCell.appendChild(downloadLink);
    }
    tr.appendChild(resultCell);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  for (const btn of document.querySelectorAll('.job-link[data-job-id]')) {
    btn.addEventListener('click', () => watchJob(btn.getAttribute('data-job-id')));
  }
}

function renderJobLog(job) {
  const lines = job && Array.isArray(job.logs) ? job.logs : [];
  document.getElementById('jobLog').value = lines.join('\n');
  document.getElementById('jobSummary').textContent = job
    ? `当前任务: ${job.title || job.id} / ${job.status} / ${job.progress || 0}%`
    : '';
}

async function refreshJobs() {
  const data = await fetchJson('/api/jobs');
  const jobs = data.jobs || [];
  renderJobs(jobs);
  if (!activeJobId && jobs.length > 0) {
    activeJobId = jobs[0].id;
  }
  if (activeJobId) {
    const jobData = await fetchJson('/api/jobs/' + encodeURIComponent(activeJobId));
    renderJobLog(jobData.job);
    if (jobData.job.status !== 'running' && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }
}

function watchJob(jobId) {
  activeJobId = jobId || '';
  refreshJobs().catch(err => setHint('jobSummary', err.message, 'muted warn'));
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    refreshJobs().catch(() => {});
  }, 1200);
}

function bindEvents() {
  for (const chip of document.querySelectorAll('.quick-chip')) {
    chip.addEventListener('click', () => applyConnectionShortcut(chip));
  }
  document.getElementById('btnTogglePassword').addEventListener('click', togglePasswordVisibility);
  document.getElementById('btnClearPassword').addEventListener('click', clearPassword);
  document.getElementById('btnTestConnection').addEventListener('click', () => {
    testConnection().catch(err => setHint('connectionHint', err.message, 'muted warn'));
  });
  document.getElementById('btnLoadDatabases').addEventListener('click', () => {
    loadDatabases().catch(err => setHint('objectHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshTables').addEventListener('click', () => {
    loadExportTables().catch(err => setHint('objectHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshImportTables').addEventListener('click', () => {
    loadImportTables().catch(err => setHint('importHint', err.message, 'muted'));
  });
  for (const id of [
    'databaseSelect',
    'restoreDatabaseSelect',
    'importDatabaseSelect',
    'tableSelect',
    'importTableSelect',
  ]) {
    document.getElementById(id).addEventListener('change', () => {
      refreshSizedCatalog().catch(err => {
        const hintId = id.startsWith('import') ? 'importHint' : 'objectHint';
        setHint(hintId, err.message, 'muted warn');
      });
    });
  }
  document.getElementById('outputDir').addEventListener('change', saveState);
  for (const id of ['dbHost', 'dbPort', 'dbUsername']) {
    document.getElementById(id).addEventListener('change', saveState);
    document.getElementById(id).addEventListener('input', updateQuickChipState);
  }
  document.getElementById('btnUseDefaultOutputDir').addEventListener('click', () => {
    document.getElementById('outputDir').value = defaultOutputDir;
    saveState();
  });
  document.getElementById('btnChooseOutputDir').addEventListener('click', () => {
    chooseOutputFolder().catch(err => setHint('backupHint', err.message, 'muted warn'));
  });
  document.getElementById('btnBackupSql').addEventListener('click', () => {
    startBackup().catch(err => setHint('backupHint', err.message, 'muted warn'));
  });
  document.getElementById('btnBackupTableSql').addEventListener('click', () => {
    startTableBackup().catch(err => setHint('backupHint', err.message, 'muted warn'));
  });
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    startCsvExport().catch(err => setHint('backupHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshBackups').addEventListener('click', () => {
    loadServerBackups().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRegisterSql').addEventListener('click', () => {
    registerLocalFile('sql').catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRestoreServerBackup').addEventListener('click', () => {
    startRestoreServerBackup().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshCsvExports').addEventListener('click', () => {
    loadServerCsvExports().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRegisterCsv').addEventListener('click', () => {
    registerLocalFile('csv').catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('forceCsvImport').addEventListener('change', syncForceImportTruncate);
  document.getElementById('btnImportServerCsv').addEventListener('click', () => {
    startImportServerCsv().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshJobs').addEventListener('click', () => {
    refreshJobs().catch(err => setHint('jobSummary', err.message, 'muted warn'));
  });
  syncForceImportTruncate();
}

async function init() {
  await loadConfig();
  bindEvents();
  enableButtonClickFeedback();
  const saved = loadSavedState();
  if (saved && saved.database) {
    await loadDatabases(saved).catch(err => setHint('objectHint', err.message, 'muted warn'));
  }
  await refreshJobs();
  await loadServerBackups();
  await loadServerCsvExports();
}

init().catch(err => alert(err.message));
