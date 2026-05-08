const hostInput = document.getElementById("opcua-host");
const portInput = document.getElementById("opcua-port");
const statusEl = document.getElementById("opcua-status");
const browseNodeInput = document.getElementById("browse-node-id");
const browseList = document.getElementById("browse-list");
const resultEl = document.getElementById("action-result");
const configFileSelect = document.getElementById("config-file-select");
const nameModalOverlay = document.getElementById("name-modal-overlay");
const nameModalInput = document.getElementById("name-modal-input");
const nameModalHint = document.getElementById("name-modal-hint");
const nameModalCancel = document.getElementById("name-modal-cancel");
const nameModalConfirm = document.getElementById("name-modal-confirm");
const confirmModalOverlay = document.getElementById("confirm-modal-overlay");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const confirmModalCancel = document.getElementById("confirm-modal-cancel");
const confirmModalConfirm = document.getElementById("confirm-modal-confirm");

let currentConfig = createDefaultConfig();
let currentFilename = "";
let multiSelectModal = null;
const PAGE_STATE_KEY = "sd_sma_collector_web_state_v1";
const ALLOWED_DATATYPES = ["bool", "int", "float", "string", "datetime"];

function createDefaultConfig() {
  return {
    communications: [],
    connections: [],
    points: [],
    groups: [],
    database: {
      type: "mysql",
      name: "",
      host: "127.0.0.1",
      port: 3306,
      username: "",
      password: "",
      data_groups: [],
    },
    logging: {
      level: "INFO",
      output_dir: "logs",
      backup_days: 14,
      rotation_when: "midnight",
      rotation_interval: 1,
      console_enabled: true,
    },
  };
}

function normalizeConfig(payload) {
  const base = createDefaultConfig();
  const next = { ...base, ...payload };
  next.communications = Array.isArray(next.communications) ? next.communications : [];
  next.connections = Array.isArray(next.connections) ? next.connections : [];
  next.points = Array.isArray(next.points) ? next.points : [];
  next.groups = Array.isArray(next.groups) ? next.groups : [];
  next.database = typeof next.database === "object" && next.database ? { ...base.database, ...next.database } : { ...base.database };
  next.logging = typeof next.logging === "object" && next.logging ? { ...base.logging, ...next.logging } : { ...base.logging };
  return next;
}

function savePageState() {
  const activeTab = document.querySelector(".tab-btn.active")?.dataset?.tab || "communications";
  const state = {
    currentConfig,
    currentFilename,
    activeTab,
    opcuaHost: hostInput.value || "",
    opcuaPort: portInput.value || "",
    browseNodeId: browseNodeInput.value || "",
  };
  try {
    localStorage.setItem(PAGE_STATE_KEY, JSON.stringify(state));
  } catch (_) {
    // Ignore localStorage errors.
  }
}

function loadPageState() {
  try {
    const raw = localStorage.getItem(PAGE_STATE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.currentConfig) {
        currentConfig = normalizeConfig(parsed.currentConfig);
      }
      if (typeof parsed.currentFilename === "string") {
        currentFilename = parsed.currentFilename;
      }
      if (typeof parsed.opcuaHost === "string") {
        hostInput.value = parsed.opcuaHost;
      }
      if (typeof parsed.opcuaPort === "string" || typeof parsed.opcuaPort === "number") {
        portInput.value = String(parsed.opcuaPort);
      }
      if (typeof parsed.browseNodeId === "string") {
        browseNodeInput.value = parsed.browseNodeId;
      }
      if (typeof parsed.activeTab === "string" && parsed.activeTab) {
        document.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("active"));
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${parsed.activeTab}"]`);
        const tabPanel = document.getElementById(`tab-${parsed.activeTab}`);
        if (tabBtn && tabPanel) {
          tabBtn.classList.add("active");
          tabPanel.classList.add("active");
        }
      }
    }
  } catch (_) {
    // Ignore invalid stored state.
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `请求失败: ${response.status}`);
  }
  return data;
}

function setResult(text) {
  resultEl.textContent = text;
}

function createInput(value, onChange, type = "text") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  input.addEventListener("change", () => {
    onChange(input.value);
    savePageState();
  });
  return input;
}

function createCheckbox(checked, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!checked;
  input.addEventListener("change", () => {
    onChange(input.checked);
    savePageState();
  });
  return input;
}

function createSelect(options, value, onChange) {
  const select = document.createElement("select");
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (String(value) === String(opt.value)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    onChange(select.value);
    savePageState();
  });
  return select;
}

function createMultiSelect(options, values, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "multi-select-inline";
  const summary = document.createElement("span");
  summary.className = "multi-select-inline-summary";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.textContent = "选择点位";
  const selectedValues = new Set(Array.isArray(values) ? values.map((v) => String(v)) : []);

  function selectedLabel() {
    const names = Array.from(selectedValues);
    if (!names.length) {
      return "未选择";
    }
    if (names.length <= 2) {
      return names.join(", ");
    }
    return `${names.slice(0, 2).join(", ")} ... (${names.length}项)`;
  }

  function updateSummary() {
    summary.textContent = selectedLabel();
  }

  openBtn.addEventListener("click", () => {
    if (!options.length) {
      setResult("暂无可选点位，请先在点位页签新增");
      return;
    }
    openMultiSelectDialog({
      title: "选择 data_points",
      options,
      selectedValues: Array.from(selectedValues),
      onConfirm: (nextValues) => {
        selectedValues.clear();
        nextValues.forEach((v) => selectedValues.add(String(v)));
        updateSummary();
        onChange(Array.from(selectedValues));
        savePageState();
      },
    });
  });

  updateSummary();
  wrapper.appendChild(summary);
  wrapper.appendChild(openBtn);
  return wrapper;
}

function ensureMultiSelectModal() {
  if (multiSelectModal) {
    return multiSelectModal;
  }
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  const titleEl = document.createElement("h3");
  titleEl.className = "modal-title";

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.textContent = "全选";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清空";
  actions.appendChild(selectAllBtn);
  actions.appendChild(clearBtn);

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "modal-options";

  const footer = document.createElement("div");
  footer.className = "modal-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "取消";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "确定";
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  dialog.appendChild(titleEl);
  dialog.appendChild(actions);
  dialog.appendChild(optionsContainer);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  multiSelectModal = {
    overlay,
    titleEl,
    optionsContainer,
    selectAllBtn,
    clearBtn,
    cancelBtn,
    okBtn,
    close: () => {
      overlay.style.display = "none";
      optionsContainer.innerHTML = "";
    },
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      multiSelectModal.close();
    }
  });
  cancelBtn.addEventListener("click", () => multiSelectModal.close());

  return multiSelectModal;
}

function openMultiSelectDialog({ title, options, selectedValues, onConfirm }) {
  const modal = ensureMultiSelectModal();
  modal.overlay.style.display = "flex";
  modal.titleEl.textContent = title;
  modal.optionsContainer.innerHTML = "";

  const selected = new Set((selectedValues || []).map((v) => String(v)));
  const checkboxes = [];
  options.forEach((opt, idx) => {
    const row = document.createElement("label");
    row.className = "modal-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `modal_multi_${idx}_${String(opt.value).replace(/[^a-zA-Z0-9_]/g, "_")}`;
    checkbox.value = String(opt.value);
    checkbox.checked = selected.has(String(opt.value));
    const text = document.createElement("span");
    text.textContent = opt.label;
    row.appendChild(checkbox);
    row.appendChild(text);
    modal.optionsContainer.appendChild(row);
    checkboxes.push(checkbox);
  });

  modal.selectAllBtn.onclick = () => {
    checkboxes.forEach((cb) => {
      cb.checked = true;
    });
  };
  modal.clearBtn.onclick = () => {
    checkboxes.forEach((cb) => {
      cb.checked = false;
    });
  };
  modal.okBtn.onclick = () => {
    const values = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
    onConfirm(values);
    modal.close();
  };
}

function createRow(columns) {
  const row = document.createElement("div");
  row.className = "grid-row";
  columns.forEach((node) => row.appendChild(node));
  return row;
}

function createHeaderCell(text) {
  const div = document.createElement("div");
  div.className = "col-header";
  div.textContent = text;
  return div;
}

function appendHeaders(panel, headers) {
  panel.appendChild(createRow(headers.map((h) => createHeaderCell(h))));
}

function createRemoveButton(onClick) {
  const button = document.createElement("button");
  button.textContent = "删除";
  button.addEventListener("click", onClick);
  return button;
}

function rerender() {
  renderCommunications();
  renderConnections();
  renderPoints();
  renderGroups();
  renderDatabase();
  renderLogging();
  savePageState();
}

function getPointNameOptions() {
  return currentConfig.points
    .map((p) => String((p && p.name) || "").trim())
    .filter(Boolean)
    .map((name) => ({ value: name, label: name }));
}

function getGroupNameOptions() {
  return currentConfig.groups
    .map((g) => String((g && g.name) || "").trim())
    .filter(Boolean)
    .map((name) => ({ value: name, label: name }));
}

function renderCommunications() {
  const panel = document.getElementById("tab-communications");
  panel.innerHTML = "";
  appendHeaders(panel, ["名称(name)", "类型(type)", "主机(host)", "端口(port)", "操作"]);
  currentConfig.communications.forEach((item, idx) => {
    const row = createRow([
      createInput(item.name || "", (v) => {
        currentConfig.communications[idx].name = v;
        renderConnections();
      }),
      createSelect([{ value: "opcua", label: "opcua" }], item.type || "opcua", (v) => {
        currentConfig.communications[idx].type = v;
      }),
      createInput(item.host || "", (v) => (currentConfig.communications[idx].host = v)),
      createInput(item.port || 4840, (v) => (currentConfig.communications[idx].port = Number(v) || 4840), "number"),
      createRemoveButton(() => {
        currentConfig.communications.splice(idx, 1);
        rerender();
      }),
    ]);
    panel.appendChild(row);
  });
  const add = document.createElement("button");
  add.textContent = "新增通信";
  add.addEventListener("click", () => {
    currentConfig.communications.push({ name: "", type: "opcua", host: "127.0.0.1", port: 4840 });
    renderCommunications();
    renderConnections();
  });
  panel.appendChild(add);
}

function renderConnections() {
  const panel = document.getElementById("tab-connections");
  panel.innerHTML = "";
  appendHeaders(panel, ["名称(name)", "通信(communication)", "数据组(data_groups)", "心跳(heartbeat)", "操作"]);
  const communicationOptions = currentConfig.communications.map((c) => ({
    value: c.name || "",
    label: c.name || "(未命名通信)",
  }));
  const groupOptions = getGroupNameOptions();
  currentConfig.connections.forEach((item, idx) => {
    const row = createRow([
      createInput(item.name || "", (v) => (currentConfig.connections[idx].name = v)),
      createSelect(
        [{ value: "", label: "请选择通信" }, ...communicationOptions],
        item.communication || "",
        (v) => (currentConfig.connections[idx].communication = v)
      ),
      createMultiSelect(groupOptions, item.data_groups || [], (values) => {
        currentConfig.connections[idx].data_groups = values;
      }),
      createInput(item.heartbeat || "", (v) => (currentConfig.connections[idx].heartbeat = v)),
      createRemoveButton(() => {
        currentConfig.connections.splice(idx, 1);
        rerender();
      }),
    ]);
    panel.appendChild(row);
  });
  const add = document.createElement("button");
  add.textContent = "新增连接";
  add.addEventListener("click", () => {
    currentConfig.connections.push({ name: "", communication: "", data_groups: [], heartbeat: "" });
    renderConnections();
  });
  panel.appendChild(add);
}

function renderPoints() {
  const panel = document.getElementById("tab-points");
  panel.innerHTML = "";
  appendHeaders(panel, ["名称(name)", "路径(path)", "描述(description)", "数据类型(datatype)", "操作"]);
  currentConfig.points.forEach((item, idx) => {
    const row = createRow([
      createInput(item.name || "", (v) => {
        currentConfig.points[idx].name = v;
        renderGroups();
      }),
      createInput(item.path || "", (v) => (currentConfig.points[idx].path = v)),
      createInput(item.description || "", (v) => (currentConfig.points[idx].description = v)),
      createSelect(
        [{ value: "", label: "(留空)" }, ...ALLOWED_DATATYPES.map((x) => ({ value: x, label: x }))],
        item.datatype || "",
        (v) => (currentConfig.points[idx].datatype = v)
      ),
      createRemoveButton(() => {
        currentConfig.points.splice(idx, 1);
        rerender();
      }),
    ]);
    panel.appendChild(row);
  });
  const add = document.createElement("button");
  add.textContent = "新增点位";
  add.addEventListener("click", () => {
    currentConfig.points.push({ name: "", path: "", description: "", datatype: "" });
    renderPoints();
  });
  panel.appendChild(add);
}

function renderGroups() {
  const panel = document.getElementById("tab-groups");
  panel.innerHTML = "";
  appendHeaders(panel, ["名称", "描述", "触发类型", "采集间隔(秒)", ""]);
  const pointOptions = getPointNameOptions();
  currentConfig.groups.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.appendChild(
      createRow([
        createInput(item.name || "", (v) => {
          currentConfig.groups[idx].name = v;
          renderConnections();
          renderDatabase();
        }),
        createInput(item.description || "", (v) => (currentConfig.groups[idx].description = v)),
        createSelect(
          [
            { value: "time", label: "time" },
            { value: "variable", label: "variable" },
            { value: "time_and_variable", label: "time_and_variable" },
          ],
          item.trigger || "time",
          (v) => (currentConfig.groups[idx].trigger = v)
        ),
        createInput(item.interval_seconds || 1, (v) => (currentConfig.groups[idx].interval_seconds = Number(v) || 1), "number"),
      ])
    );
    card.appendChild(createRow([createHeaderCell("触发点"), createHeaderCell("触发间隔(秒)"), createHeaderCell("数据点列表(多选)"), createHeaderCell("唯一键点"), createHeaderCell("")]));
    card.appendChild(
      createRow([
        createSelect(
          [{ value: "", label: "请选择点位" }, ...pointOptions],
          item.trigger_point || "",
          (v) => (currentConfig.groups[idx].trigger_point = v)
        ),
        createInput(item.trigger_interval_seconds || "", (v) => {
          currentConfig.groups[idx].trigger_interval_seconds = v === "" ? null : Number(v);
        }, "number"),
        createMultiSelect(pointOptions, item.data_points || [], (values) => {
          currentConfig.groups[idx].data_points = values;
        }),
        createSelect(
          [{ value: "", label: "请选择点位" }, ...pointOptions],
          item.unique_key_point || "",
          (v) => (currentConfig.groups[idx].unique_key_point = v)
        ),
      ])
    );
    card.appendChild(createRow([createHeaderCell("读后复位"), createHeaderCell("分表间隔(天)"), createHeaderCell("批量写入"), createHeaderCell("并行触发"), createHeaderCell("操作")]));
    card.appendChild(
      createRow([
        createCheckbox(item.reset_trigger_after_read !== false, (v) => (currentConfig.groups[idx].reset_trigger_after_read = v)),
        createInput(item.recreate_interval_days || 30, (v) => (currentConfig.groups[idx].recreate_interval_days = Number(v) || 30), "number"),
        createInput(item.batch_insert_size || 100, (v) => (currentConfig.groups[idx].batch_insert_size = Number(v) || 100), "number"),
        createCheckbox(item.is_parallel === true, (v) => (currentConfig.groups[idx].is_parallel = v)),
        createRemoveButton(() => {
          currentConfig.groups.splice(idx, 1);
          rerender();
        }),
      ])
    );
    panel.appendChild(card);
  });
  const add = document.createElement("button");
  add.textContent = "新增数据组";
  add.addEventListener("click", () => {
    currentConfig.groups.push({
      name: "",
      interval_seconds: 1,
      trigger: "time",
      description: "",
      data_points: [],
      trigger_point: "",
      reset_trigger_after_read: true,
      recreate_interval_days: 30,
      batch_insert_size: 100,
      is_parallel: false,
    });
    renderGroups();
  });
  panel.appendChild(add);
}

function renderDatabase() {
  const panel = document.getElementById("tab-database");
  const db = currentConfig.database;
  const groupOptions = getGroupNameOptions();
  panel.innerHTML = "";
  appendHeaders(panel, ["数据库类型", "数据库名", "主机", "端口", ""]);
  panel.appendChild(
    createRow([
      createSelect(
        [
          { value: "mysql", label: "mysql" },
          { value: "sqlite", label: "sqlite" },
        ],
        db.type || "mysql",
        (v) => (db.type = v)
      ),
      createInput(db.name || "", (v) => (db.name = v)),
      createInput(db.host || "127.0.0.1", (v) => (db.host = v)),
      createInput(db.port || 3306, (v) => (db.port = Number(v) || 3306), "number"),
    ])
  );
  appendHeaders(panel, ["用户名", "密码", "数据组(data_groups)", "", ""]);
  panel.appendChild(
    createRow([
      createInput(db.username || "", (v) => (db.username = v)),
      createInput(db.password || "", (v) => (db.password = v)),
      createMultiSelect(groupOptions, db.data_groups || [], (values) => {
        db.data_groups = values;
      }),
    ])
  );
}

function renderLogging() {
  const panel = document.getElementById("tab-logging");
  const logging = currentConfig.logging;
  panel.innerHTML = "";
  appendHeaders(panel, ["级别(level)", "目录(output_dir)", "保留天数", "", ""]);
  panel.appendChild(
    createRow([
      createSelect(
        [
          { value: "DEBUG", label: "DEBUG" },
          { value: "INFO", label: "INFO" },
          { value: "WARNING", label: "WARNING" },
          { value: "ERROR", label: "ERROR" },
          { value: "CRITICAL", label: "CRITICAL" },
        ],
        logging.level || "INFO",
        (v) => (logging.level = v)
      ),
      createInput(logging.output_dir || "logs", (v) => (logging.output_dir = v)),
      createInput(logging.backup_days || 14, (v) => (logging.backup_days = Number(v) || 14), "number"),
    ])
  );
  appendHeaders(panel, ["轮转周期(rotation_when)", "轮转间隔", "控制台输出", "", ""]);
  panel.appendChild(
    createRow([
      createSelect(
        [
          { value: "S", label: "S (秒)" },
          { value: "M", label: "M (分钟)" },
          { value: "H", label: "H (小时)" },
          { value: "D", label: "D (天)" },
          { value: "midnight", label: "midnight (午夜)" },
          { value: "W0", label: "W0 (周一)" },
          { value: "W1", label: "W1 (周二)" },
          { value: "W2", label: "W2 (周三)" },
          { value: "W3", label: "W3 (周四)" },
          { value: "W4", label: "W4 (周五)" },
          { value: "W5", label: "W5 (周六)" },
          { value: "W6", label: "W6 (周日)" },
        ],
        logging.rotation_when || "midnight",
        (v) => (logging.rotation_when = v)
      ),
      createInput(logging.rotation_interval || 1, (v) => (logging.rotation_interval = Number(v) || 1), "number"),
      createCheckbox(logging.console_enabled !== false, (v) => (logging.console_enabled = v)),
    ])
  );
}

async function refreshFileList() {
  const data = await api("/api/config/files");
  const files = data.files || [];
  configFileSelect.innerHTML = "";
  files.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    configFileSelect.appendChild(opt);
  });
  if (!files.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(config 目录无 JSON 文件)";
    configFileSelect.appendChild(opt);
    currentFilename = "";
    return;
  }

  if (currentFilename && files.includes(currentFilename)) {
    configFileSelect.value = currentFilename;
  } else {
    currentFilename = files[0];
    configFileSelect.value = currentFilename;
  }
  savePageState();
}

async function loadConfigFile() {
  const filename = (configFileSelect.value || "").trim();
  if (!filename) {
    setResult("请先选择配置文件");
    return;
  }
  const data = await api(`/api/config/file?filename=${encodeURIComponent(filename)}`);
  currentFilename = data.filename || filename;
  currentConfig = normalizeConfig(data.payload || {});
  rerender();
  const hidden = data.hidden || {};
  setResult(
    `已读取 ${data.filename}，隐藏查询组 ${hidden.query_groups_hidden || 0} 个，隐藏 query_config ${hidden.query_fields_hidden || 0} 个`
  );
  savePageState();
}

async function loadTemplate() {
  const payload = await api("/api/config/template");
  currentConfig = normalizeConfig(payload);
  rerender();
  const filename = await showNameModal("new_config");
  if (!filename) {
    setResult("已取消新建");
    return;
  }
  const res = await api("/api/config/write", {
    method: "POST",
    body: JSON.stringify({ payload: currentConfig, filename }),
  });
  currentFilename = filename;
  await refreshFileList();
  setResult(`已基于模板新建文件: ${res.path}`);
  savePageState();
}

async function validateTemplate() {
  await api("/api/config/validate", {
    method: "POST",
    body: JSON.stringify({ payload: currentConfig }),
  });
  setResult("配置校验通过");
}

async function saveCurrentFile() {
  let filename = (currentFilename || "").trim();
  if (!filename) {
    filename = await showNameModal("new_config");
    if (!filename) {
      setResult("已取消保存");
      return;
    }
  }
  const res = await api("/api/config/write", {
    method: "POST",
    body: JSON.stringify({ payload: currentConfig, filename }),
  });
  currentFilename = filename;
  await refreshFileList();
  setResult(`保存成功: ${res.path}`);
  savePageState();
}

async function deleteCurrentFile() {
  const filename = (configFileSelect.value || currentFilename || "").trim();
  if (!filename) {
    setResult("没有可删除的文件");
    return;
  }
  const confirmed = await showConfirmModal({
    title: "删除确认（1/2）",
    message: `确认删除配置文件 ${filename} 吗？`,
  });
  if (!confirmed) {
    setResult("已取消删除");
    return;
  }
  const confirmedAgain = await showConfirmModal({
    title: "删除确认（2/2）",
    message: `二次确认：删除后不可恢复，是否继续删除 ${filename}？`,
  });
  if (!confirmedAgain) {
    setResult("已取消删除");
    return;
  }

  const res = await api("/api/config/file/delete", {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
  currentFilename = "";
  await refreshFileList();
  const nextFilename = (configFileSelect.value || "").trim();
  if (nextFilename) {
    await loadConfigFile();
  } else {
    currentConfig = createDefaultConfig();
    rerender();
  }
  setResult(`删除成功: ${res.path}`);
  savePageState();
}

async function connectOpcua() {
  const host = hostInput.value.trim();
  const port = Number(portInput.value);
  const data = await api("/api/opcua/connect", {
    method: "POST",
    body: JSON.stringify({ host, port }),
  });
  statusEl.textContent = `已连接: ${data.server_url}`;
  setResult("OPC UA 连接成功");
}

async function disconnectOpcua() {
  await api("/api/opcua/disconnect", { method: "POST" });
  statusEl.textContent = "已断开";
  setResult("OPC UA 已断开");
}

async function fetchChildren(nodeId) {
  const query = nodeId ? `?node_id=${encodeURIComponent(nodeId)}` : "";
  const data = await api(`/api/opcua/browse${query}`);
  return data.items || [];
}

function createNodeLabel(item) {
  const span = document.createElement("span");
  span.textContent = `${item.display_name} | ${item.node_class} | ${item.node_id}`;
  return span;
}

function createAddPointButton(item) {
  const btn = document.createElement("button");
  btn.className = "node-button";
  btn.textContent = "加入 points";
  btn.addEventListener("click", async () => {
    try {
      const res = await api("/api/config/points/from-node", {
        method: "POST",
        body: JSON.stringify({
          payload: currentConfig,
          node_id: item.node_id,
          display_name: item.display_name,
          datatype: "",
        }),
      });
      currentConfig = normalizeConfig(res.payload || {});
      renderPoints();
      setResult(`已加入点位: ${res.point.name}`);
    } catch (error) {
      setResult(error.message);
    }
  });
  return btn;
}

function createExpandButton(item, childContainer) {
  const btn = document.createElement("button");
  btn.className = "node-button";
  btn.textContent = "展开";
  btn.dataset.expanded = "false";
  btn.addEventListener("click", async () => {
    try {
      const expanded = btn.dataset.expanded === "true";
      if (expanded) {
        childContainer.style.display = "none";
        btn.dataset.expanded = "false";
        btn.textContent = "展开";
        return;
      }
      if (!childContainer.dataset.loaded) {
        const children = await fetchChildren(item.node_id);
        renderNodes(children, childContainer);
        childContainer.dataset.loaded = "true";
      }
      childContainer.style.display = "block";
      btn.dataset.expanded = "true";
      btn.textContent = "收起";
    } catch (error) {
      setResult(error.message);
    }
  });
  return btn;
}

function renderNodes(items, container) {
  container.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.appendChild(createNodeLabel(item));
    li.appendChild(createAddPointButton(item));
    if (item.has_children) {
      const childContainer = document.createElement("ul");
      childContainer.className = "list";
      childContainer.style.display = "none";
      li.appendChild(createExpandButton(item, childContainer));
      li.appendChild(childContainer);
    }
    container.appendChild(li);
  });
}

async function browseOpcua() {
  const nodeId = browseNodeInput.value.trim();
  browseList.innerHTML = "";
  const rootItems = await fetchChildren(nodeId || "");
  renderNodes(rootItems, browseList);
  setResult(`已加载根层节点，共 ${rootItems.length} 个`);
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tab}`).classList.add("active");
      savePageState();
    });
  });
}

function showNameModal(defaultBaseName = "new_config") {
  return new Promise((resolve) => {
    nameModalHint.textContent = "文件后缀固定为 .json";
    nameModalInput.value = defaultBaseName;
    nameModalOverlay.style.display = "flex";
    nameModalInput.focus();
    nameModalInput.select();

    const cleanup = () => {
      nameModalOverlay.style.display = "none";
      nameModalCancel.removeEventListener("click", onCancel);
      nameModalConfirm.removeEventListener("click", onConfirm);
      nameModalOverlay.removeEventListener("click", onOverlayClick);
      nameModalInput.removeEventListener("keydown", onKeyDown);
    };

    const onCancel = () => {
      cleanup();
      resolve("");
    };

    const onConfirm = () => {
      const raw = nameModalInput.value.trim();
      if (!raw) {
        nameModalHint.textContent = "文件名不能为空";
        return;
      }
      if (/[\\/:*?"<>|]/.test(raw)) {
        nameModalHint.textContent = "文件名包含非法字符 \\ / : * ? \" < > |";
        return;
      }
      cleanup();
      resolve(`${raw}.json`);
    };

    const onOverlayClick = (e) => {
      if (e.target === nameModalOverlay) {
        onCancel();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        onConfirm();
      } else if (e.key === "Escape") {
        onCancel();
      }
    };

    nameModalCancel.addEventListener("click", onCancel);
    nameModalConfirm.addEventListener("click", onConfirm);
    nameModalOverlay.addEventListener("click", onOverlayClick);
    nameModalInput.addEventListener("keydown", onKeyDown);
  });
}

function showConfirmModal({ title, message }) {
  return new Promise((resolve) => {
    confirmModalTitle.textContent = title || "确认";
    confirmModalMessage.textContent = message || "";
    confirmModalOverlay.style.display = "flex";

    const cleanup = () => {
      confirmModalOverlay.style.display = "none";
      confirmModalCancel.removeEventListener("click", onCancel);
      confirmModalConfirm.removeEventListener("click", onConfirm);
      confirmModalOverlay.removeEventListener("click", onOverlayClick);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onOverlayClick = (e) => {
      if (e.target === confirmModalOverlay) {
        onCancel();
      }
    };

    confirmModalCancel.addEventListener("click", onCancel);
    confirmModalConfirm.addEventListener("click", onConfirm);
    confirmModalOverlay.addEventListener("click", onOverlayClick);
  });
}

document.getElementById("btn-refresh-files").addEventListener("click", () => {
  refreshFileList().catch((error) => setResult(error.message));
});
document.getElementById("btn-load-file").addEventListener("click", () => {
  loadConfigFile().catch((error) => setResult(error.message));
});
document.getElementById("btn-load-template").addEventListener("click", () => {
  loadTemplate().catch((error) => setResult(error.message));
});
document.getElementById("btn-validate").addEventListener("click", () => {
  validateTemplate().catch((error) => setResult(error.message));
});
document.getElementById("btn-save-file").addEventListener("click", () => {
  saveCurrentFile().catch((error) => setResult(error.message));
});
document.getElementById("btn-delete-file").addEventListener("click", () => {
  deleteCurrentFile().catch((error) => setResult(error.message));
});
document.getElementById("btn-connect").addEventListener("click", () => {
  connectOpcua().catch((error) => setResult(error.message));
});
document.getElementById("btn-disconnect").addEventListener("click", () => {
  disconnectOpcua().catch((error) => setResult(error.message));
});
document.getElementById("btn-browse").addEventListener("click", () => {
  browseOpcua().catch((error) => setResult(error.message));
});

bindTabs();
loadPageState();
rerender();
refreshFileList().catch((error) => setResult(error.message));
window.addEventListener("beforeunload", savePageState);

