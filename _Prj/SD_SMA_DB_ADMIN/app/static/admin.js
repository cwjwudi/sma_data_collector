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

function appendOption(select, value) {
  const op = document.createElement('option');
  op.value = value;
  op.textContent = value;
  select.appendChild(op);
}

function hasOption(select, value) {
  return Array.from(select.options).some(option => option.value === value);
}

function setSelectValueIfPresent(id, value) {
  const sel = document.getElementById(id);
  if (value && hasOption(sel, value)) sel.value = value;
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
  document.getElementById('outputDir').value = saved?.outputDir || defaultOutputDir;
  setHint('connectionHint', `默认导出目录: ${defaultOutputDir || '-'}`);
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
  for (const id of ['databaseSelect', 'restoreDatabaseSelect', 'importDatabaseSelect']) {
    const sel = document.getElementById(id);
    const previous = sel.value;
    sel.innerHTML = '';
    for (const name of databases) appendOption(sel, name);
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
  const tables = await fetchTables(database);
  const sel = document.getElementById('tableSelect');
  const previous = preferredTable || sel.value;
  sel.innerHTML = '';
  for (const name of tables) appendOption(sel, name);
  if (previous && hasOption(sel, previous)) sel.value = previous;
  setHint('objectHint', `数据库 ${database}，表数量: ${tables.length}`);
  saveState();
}

async function loadImportTables(preferredTable = '') {
  const database = getSelectedValue('importDatabaseSelect', '请先选择导入目标数据库');
  const tables = await fetchTables(database);
  const sel = document.getElementById('importTableSelect');
  const previous = preferredTable || sel.value;
  sel.innerHTML = '';
  for (const name of tables) appendOption(sel, name);
  if (previous && hasOption(sel, previous)) sel.value = previous;
  saveState();
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
  setHint('backupHint', `已开始 SQL 备份任务，输出目录: ${getOutputDir() || defaultOutputDir}`, 'muted ok');
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
  setHint('backupHint', `已开始 CSV 导出任务，输出目录: ${getOutputDir() || defaultOutputDir}`, 'muted ok');
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

function buildConnectionFormData(database) {
  const fd = new FormData();
  fd.append('connection_json', JSON.stringify({ connection: getConnectionPayload() }));
  fd.append('database', database);
  fd.append('confirmed', 'true');
  return fd;
}

async function startRestoreSql() {
  const database = getSelectedValue('restoreDatabaseSelect', '请先选择恢复目标数据库');
  const file = document.getElementById('restoreSqlFile').files[0];
  if (!file) throw new Error('请选择 SQL 文件');
  if (!(await requireDoubleConfirm('恢复 SQL', database))) {
    setHint('importHint', '已取消 SQL 恢复', 'muted');
    return;
  }
  const fd = buildConnectionFormData(database);
  fd.append('file', file);
  const resp = await fetch('/api/restore-sql', { method: 'POST', body: fd });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  watchJob(data.job.id);
  setHint('importHint', `已开始 SQL 恢复任务，目标数据库: ${database}`, 'muted warn');
}

async function startImportCsv() {
  const database = getSelectedValue('importDatabaseSelect', '请先选择导入目标数据库');
  const table = getSelectedValue('importTableSelect', '请先选择导入目标表');
  const file = document.getElementById('importCsvFile').files[0];
  if (!file) throw new Error('请选择 CSV 文件');
  if (!(await requireDoubleConfirm('导入 CSV', `${database}.${table}`))) {
    setHint('importHint', '已取消 CSV 导入', 'muted');
    return;
  }
  const fd = buildConnectionFormData(database);
  fd.append('table', table);
  fd.append('truncate', document.getElementById('truncateBeforeImport').checked ? 'true' : 'false');
  fd.append('file', file);
  const resp = await fetch('/api/import-csv', { method: 'POST', body: fd });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  watchJob(data.job.id);
  setHint('importHint', `已开始 CSV 导入任务，目标表: ${database}.${table}`, 'muted warn');
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
      ? job.result.path
      : (job.error || job.phase || '');
    tr.innerHTML =
      `<td><button type="button" class="job-link status-pill ${statusClass(status)}" data-job-id="${job.id}">${status}</button></td>` +
      `<td>${renderProgress(job)}</td>` +
      `<td>${job.title || job.id}</td>` +
      `<td>${formatDuration(job.elapsed_seconds)}</td>` +
      `<td>${formatDuration(job.eta_seconds)}</td>` +
      `<td>${result}</td>`;
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
  document.getElementById('databaseSelect').addEventListener('change', () => {
    loadExportTables().catch(err => setHint('objectHint', err.message, 'muted warn'));
  });
  document.getElementById('importDatabaseSelect').addEventListener('change', () => {
    loadImportTables().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  for (const id of ['tableSelect', 'restoreDatabaseSelect', 'importTableSelect', 'outputDir']) {
    document.getElementById(id).addEventListener('change', saveState);
  }
  for (const id of ['dbHost', 'dbPort', 'dbUsername']) {
    document.getElementById(id).addEventListener('change', saveState);
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
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    startCsvExport().catch(err => setHint('backupHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRestoreSql').addEventListener('click', () => {
    startRestoreSql().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnImportCsv').addEventListener('click', () => {
    startImportCsv().catch(err => setHint('importHint', err.message, 'muted warn'));
  });
  document.getElementById('btnRefreshJobs').addEventListener('click', () => {
    refreshJobs().catch(err => setHint('jobSummary', err.message, 'muted warn'));
  });
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
}

init().catch(err => alert(err.message));
