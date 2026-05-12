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
let groupConfigModal = null;
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

function ensureGroupConfigModal() {
  if (groupConfigModal) {
    return groupConfigModal;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "none";

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog group-config-dialog";

  const titleEl = document.createElement("h3");
  titleEl.className = "modal-title";

  const body = document.createElement("div");
  body.className = "group-config-body";

  const footer = document.createElement("div");
  footer.className = "modal-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "取消";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "保存";
  footer.appendChild(cancelBtn);
  footer.appendChild(okBtn);

  dialog.appendChild(titleEl);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  groupConfigModal = {
    overlay,
    titleEl,
    body,
    cancelBtn,
    okBtn,
    close: () => {
      overlay.style.display = "none";
      body.innerHTML = "";
    },
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      groupConfigModal.close();
    }
  });

  return groupConfigModal;
}

function showGroupConfigModal({ title, buildBody, onConfirm }) {
  const modal = ensureGroupConfigModal();
  modal.overlay.style.display = "flex";
  modal.titleEl.textContent = title;
  modal.body.innerHTML = "";
  buildBody(modal.body);

  const cleanup = () => {
    modal.cancelBtn.removeEventListener("click", onCancel);
    modal.okBtn.removeEventListener("click", onOk);
    modal.overlay.removeEventListener("click", onOverlayClick);
  };

  const onCancel = () => {
    cleanup();
    modal.close();
  };

  const onOk = () => {
    const ok = onConfirm();
    if (ok === false) {
      return;
    }
    cleanup();
    modal.close();
    renderGroups();
    savePageState();
  };

  const onOverlayClick = (e) => {
    if (e.target === modal.overlay) {
      onCancel();
    }
  };

  modal.cancelBtn.addEventListener("click", onCancel);
  modal.okBtn.addEventListener("click", onOk);
  modal.overlay.addEventListener("click", onOverlayClick);
}

function createConfigActionButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-btn";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function createLockedField(inputNode, locked) {
  if (!locked) {
    return inputNode;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "locked-field-wrap";
  const hint = document.createElement("span");
  hint.className = "lock-hint";
  hint.textContent = "由 batch_upsert 锁定";
  wrapper.appendChild(inputNode);
  wrapper.appendChild(hint);
  return wrapper;
}

function openBatchUpsertConfig(groupIndex) {
  const group = currentConfig.groups[groupIndex];
  const pointNames = getPointNameOptions();
  const draft = {
    enabled: false,
    start_time_point: "",
    end_time_point: "",
    update_only_when_end_time_is_null: true,
    reject_when_end_time_exists: true,
    allow_idempotent_same_end_time: false,
    ...(group.batch_upsert || {}),
  };

  showGroupConfigModal({
    title: "配置 batch_upsert",
    buildBody: (body) => {
      const rows = [
        { label: "启用", type: "checkbox", key: "enabled" },
        { label: "开批时间点", type: "select", key: "start_time_point", placeholder: "请选择点位" },
        { label: "结批时间点", type: "select", key: "end_time_point", placeholder: "请选择点位" },
        { label: "仅空结批可更新", type: "checkbox", key: "update_only_when_end_time_is_null" },
        { label: "已结批拒绝写入", type: "checkbox", key: "reject_when_end_time_exists" },
        { label: "允许同值幂等结批", type: "checkbox", key: "allow_idempotent_same_end_time" },
      ];

      rows.forEach((item) => {
        const row = document.createElement("div");
        row.className = "group-config-row";
        const label = document.createElement("label");
        label.className = "group-config-label";
        label.textContent = item.label;
        row.appendChild(label);

        let field;
        if (item.type === "checkbox") {
          field = document.createElement("input");
          field.type = "checkbox";
          field.checked = !!draft[item.key];
          field.addEventListener("change", () => {
            draft[item.key] = field.checked;
          });
        } else {
          field = document.createElement("select");
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = item.placeholder || "请选择";
          field.appendChild(emptyOpt);
          pointNames.forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            field.appendChild(option);
          });
          field.value = String(draft[item.key] || "");
          field.addEventListener("change", () => {
            draft[item.key] = field.value;
          });
        }
        row.appendChild(field);
        body.appendChild(row);
      });
    },
    onConfirm: () => {
      currentConfig.groups[groupIndex].batch_upsert = { ...draft };
      if (draft.enabled) {
        currentConfig.groups[groupIndex].batch_insert_size = 1;
        currentConfig.groups[groupIndex].recreate_interval_days = 10000;
        currentConfig.groups[groupIndex].is_parallel = false;
      }
      return true;
    },
  });
}

function openInsertFeedbackConfig(groupIndex) {
  const group = currentConfig.groups[groupIndex];
  const pointNames = getPointNameOptions();
  const draft = {
    feedback_point: "",
    code_success: 0,
    code_unique_conflict: 1,
    code_db_error: 2,
    code_other_error: 3,
    ...(group.insert_feedback || {}),
  };

  showGroupConfigModal({
    title: "配置 insert_feedback",
    buildBody: (body) => {
      const rowDefs = [
        { label: "反馈点", key: "feedback_point", type: "select", placeholder: "请选择点位" },
        { label: "成功码", key: "code_success", type: "number" },
        { label: "唯一冲突码", key: "code_unique_conflict", type: "number" },
        { label: "数据库错误码", key: "code_db_error", type: "number" },
        { label: "其他错误码", key: "code_other_error", type: "number" },
      ];

      rowDefs.forEach((item) => {
        const row = document.createElement("div");
        row.className = "group-config-row";
        const label = document.createElement("label");
        label.className = "group-config-label";
        label.textContent = item.label;
        row.appendChild(label);

        let field;
        if (item.type === "select") {
          field = document.createElement("select");
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = item.placeholder || "请选择";
          field.appendChild(emptyOpt);
          pointNames.forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            field.appendChild(option);
          });
          field.value = String(draft[item.key] || "");
          field.addEventListener("change", () => {
            draft[item.key] = field.value;
          });
        } else {
          field = document.createElement("input");
          field.type = "number";
          field.step = "1";
          field.value = String(Number(draft[item.key] ?? 0));
          field.addEventListener("change", () => {
            const parsed = Number(field.value);
            draft[item.key] = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
            field.value = String(draft[item.key]);
          });
        }
        row.appendChild(field);
        body.appendChild(row);
      });
    },
    onConfirm: () => {
      currentConfig.groups[groupIndex].insert_feedback = { ...draft };
      return true;
    },
  });
}

function createRow(columns) {
  const row = document.createElement("div");
  row.className = "grid-row";
  row.classList.add(`grid-row-cols-${columns.length}`);
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

function refreshPointRelatedControls() {
  renderPoints();
  renderGroups();
  renderConnections();
  renderDatabase();
  savePageState();
}

function normalizePointName(rawName) {
  const base = String(rawName || "").trim() || "point";
  let normalized = "";
  for (const ch of base) {
    normalized += /[a-zA-Z0-9_]/.test(ch) ? ch : "_";
  }
  normalized = normalized.replace(/^_+|_+$/g, "") || "point";
  if (/^[0-9]/.test(normalized)) {
    normalized = `p_${normalized}`;
  }
  return normalized;
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
  const pointOptions = getPointNameOptions();
  currentConfig.connections.forEach((item, idx) => {
    const heartbeatValue = String(item.heartbeat || "").trim();
    const heartbeatOptions = [{ value: "", label: "不启用心跳" }, ...pointOptions];
    if (heartbeatValue && !heartbeatOptions.some((opt) => String(opt.value) === heartbeatValue)) {
      heartbeatOptions.push({ value: heartbeatValue, label: `${heartbeatValue} (未在 points 中定义)` });
    }
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
      createSelect(
        heartbeatOptions,
        heartbeatValue,
        (v) => (currentConfig.connections[idx].heartbeat = v)
      ),
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
        renderConnections();
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
    renderConnections();
  });
  panel.appendChild(add);
}

function renderGroups() {
  const panel = document.getElementById("tab-groups");
  panel.innerHTML = "";
  const pointOptions = getPointNameOptions();
  currentConfig.groups.forEach((item, idx) => {
    const groupSelectedPointOptions = pointOptions.filter((opt) =>
      (item.data_points || []).includes(opt.value)
    );
    const batchUpsertEnabled = !!(item.batch_upsert && item.batch_upsert.enabled);
    if (batchUpsertEnabled) {
      currentConfig.groups[idx].batch_insert_size = 1;
      currentConfig.groups[idx].recreate_interval_days = 10000;
      currentConfig.groups[idx].is_parallel = false;
    }

    const card = document.createElement("div");
    card.className = "group-card";
    card.appendChild(createRow([createHeaderCell("名称"), createHeaderCell("描述"), createHeaderCell("触发类型"), createHeaderCell("采集间隔(秒)")]));
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
    card.appendChild(createRow([createHeaderCell("触发点"), createHeaderCell("触发间隔(秒)"), createHeaderCell("数据点列表(多选)"), createHeaderCell("唯一键点")]));
    const advancedActions = document.createElement("div");
    advancedActions.className = "group-config-actions";
    advancedActions.appendChild(
      createConfigActionButton("配置 batch_upsert", () => openBatchUpsertConfig(idx))
    );
    advancedActions.appendChild(
      createConfigActionButton("配置 insert_feedback", () => openInsertFeedbackConfig(idx))
    );
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
          if (
            currentConfig.groups[idx].unique_key_point &&
            !values.includes(currentConfig.groups[idx].unique_key_point)
          ) {
            currentConfig.groups[idx].unique_key_point = "";
          }
          renderGroups();
        }),
        createSelect(
          [{ value: "", label: "请选择点位" }, ...groupSelectedPointOptions],
          item.unique_key_point || "",
          (v) => (currentConfig.groups[idx].unique_key_point = v)
        ),
      ])
    );
    card.appendChild(createRow([createHeaderCell("读后复位"), createHeaderCell("分表间隔(天)"), createHeaderCell("批量写入"), createHeaderCell("并行触发")]));

    const recreateInput = createInput(
      currentConfig.groups[idx].recreate_interval_days || 30,
      (v) => (currentConfig.groups[idx].recreate_interval_days = Number(v) || 30),
      "number"
    );
    recreateInput.disabled = batchUpsertEnabled;

    const batchInsertInput = createInput(
      currentConfig.groups[idx].batch_insert_size || 100,
      (v) => (currentConfig.groups[idx].batch_insert_size = Number(v) || 100),
      "number"
    );
    batchInsertInput.disabled = batchUpsertEnabled;

    card.appendChild(
      createRow([
        createCheckbox(item.reset_trigger_after_read !== false, (v) => (currentConfig.groups[idx].reset_trigger_after_read = v)),
        createLockedField(recreateInput, batchUpsertEnabled),
        createLockedField(batchInsertInput, batchUpsertEnabled),
        createLockedField(
          (() => {
            const parallelInput = createCheckbox(
              currentConfig.groups[idx].is_parallel === true,
              (v) => (currentConfig.groups[idx].is_parallel = v)
            );
            parallelInput.disabled = batchUpsertEnabled;
            return parallelInput;
          })(),
          batchUpsertEnabled
        ),
      ])
    );

    const deleteRow = document.createElement("div");
    deleteRow.className = "group-delete-row";
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "group-delete-actions";
    actionsWrap.appendChild(advancedActions);

    const deleteBtn = createRemoveButton(() => {
      currentConfig.groups.splice(idx, 1);
      rerender();
    });
    deleteBtn.classList.add("danger-btn", "group-delete-btn");
    deleteRow.appendChild(actionsWrap);
    deleteRow.appendChild(deleteBtn);
    card.appendChild(deleteRow);

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
  appendHeaders(panel, ["数据库类型", "数据库名", "主机", "端口"]);
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
  appendHeaders(panel, ["用户名", "密码", "数据组(data_groups)"]);
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
  appendHeaders(panel, ["级别(level)", "目录(output_dir)", "保留天数"]);
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
  appendHeaders(panel, ["轮转周期(rotation_when)", "轮转间隔", "控制台输出"]);
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
      const nodeId = String(item.node_id || "").trim();
      const candidateName = normalizePointName(item.display_name || item.node_id || "");
      const duplicatedPath = currentConfig.points.some((p) => String((p && p.path) || "").trim() === nodeId);
      if (duplicatedPath) {
        setResult(`校验失败：points.path 重复：${nodeId}`);
        return;
      }
      const duplicatedName = currentConfig.points.some((p) => String((p && p.name) || "").trim() === candidateName);
      if (duplicatedName) {
        setResult(`校验失败：points.name 重复：${candidateName}`);
        return;
      }

      const res = await api("/api/config/points/from-node", {
        method: "POST",
        body: JSON.stringify({
          payload: currentConfig,
          node_id: nodeId,
          display_name: item.display_name,
          datatype: "",
        }),
      });
      const nextConfig = normalizeConfig(res.payload || currentConfig || {});
      const point = res.point && typeof res.point === "object" ? { ...res.point } : null;
      if (point) {
        const pointName = String(point.name || "").trim();
        const pointExists = nextConfig.points.some((p) => String((p && p.name) || "").trim() === pointName);
        if (!pointExists) {
          nextConfig.points.push(point);
        }
      }
      currentConfig = nextConfig;
      refreshPointRelatedControls();
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

