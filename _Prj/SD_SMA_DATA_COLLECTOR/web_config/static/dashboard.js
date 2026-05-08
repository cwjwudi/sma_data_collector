const monitorConfigSelect = document.getElementById("monitor-config-select");
const monitorStatusEl = document.getElementById("monitor-status");
const monitorLogEl = document.getElementById("monitor-log");

const MONITOR_CONFIG_KEY = "sd_sma_monitor_config_v1";

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

function syncMonitorConfigSelect(files) {
  if (!monitorConfigSelect) {
    return;
  }
  if (!files.length) {
    monitorConfigSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(无配置文件)";
    monitorConfigSelect.appendChild(opt);
    return;
  }
  let saved = "";
  try {
    saved = localStorage.getItem(MONITOR_CONFIG_KEY) || "";
  } catch (_) {
    saved = "";
  }
  monitorConfigSelect.innerHTML = "";
  files.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    monitorConfigSelect.appendChild(opt);
  });
  if (saved && files.includes(saved)) {
    monitorConfigSelect.value = saved;
  } else {
    const preferred = files.find((f) => f === "sample_config.json") || files[0];
    monitorConfigSelect.value = preferred;
  }
  try {
    localStorage.setItem(MONITOR_CONFIG_KEY, monitorConfigSelect.value);
  } catch (_) {
    // ignore
  }
}

async function refreshMonitorFileList() {
  try {
    const data = await api("/api/config/files");
    syncMonitorConfigSelect(data.files || []);
  } catch (err) {
    if (monitorConfigSelect) {
      monitorConfigSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = `(文件列表加载失败: ${err.message || err})`;
      monitorConfigSelect.appendChild(opt);
    }
  }
}

function renderMonitor(statusPayload, logLines) {
  if (!monitorStatusEl) {
    return;
  }
  const st = statusPayload;
  const snap = st.snapshot;
  let text = `阶段: ${st.phase}`;
  if (st.task_active) {
    text += " (后台任务活跃)";
  }
  text += "\n";
  if (st.last_error) {
    text += `错误: ${st.last_error}\n`;
  }
  if (snap && !snap.error) {
    text += `配置文件: ${snap.config_path || ""}\n`;
    text += `采集循环运行中: ${snap.collector_running ? "是" : "否"}\n`;
    text += `初始化完成: ${snap.initialized ? "是" : "否"}\n`;
    text += `数据库: ${snap.database_connected ? "连通" : "未连通"}\n`;
    const opc = snap.opcua || {};
    text += `OPC UA 全部连通: ${opc.all_connected ? "是" : "否"}\n`;
    if (opc.by_name && typeof opc.by_name === "object") {
      text += Object.entries(opc.by_name)
        .map(([k, v]) => `  - ${k}: ${v ? "连通" : "断开"}`)
        .join("\n");
      text += "\n";
    }
  } else if (snap && snap.error) {
    text += `状态快照异常: ${snap.error}\n`;
  } else {
    text += "（采集未启动，或正在初始化 — 无快照）\n";
  }
  monitorStatusEl.textContent = text.trimEnd();
  if (monitorLogEl) {
    const lines = Array.isArray(logLines) ? logLines : [];
    monitorLogEl.textContent = lines.slice(-250).join("\n");
    monitorLogEl.scrollTop = monitorLogEl.scrollHeight;
  }
}

async function pollMonitor() {
  if (!monitorStatusEl) {
    return;
  }
  try {
    const [st, logs] = await Promise.all([api("/api/collector/status"), api("/api/collector/logs")]);
    renderMonitor(st, logs.lines || []);
  } catch (err) {
    monitorStatusEl.textContent = `状态获取失败: ${err.message || err}`;
  }
}

monitorConfigSelect?.addEventListener("change", () => {
  try {
    localStorage.setItem(MONITOR_CONFIG_KEY, monitorConfigSelect.value);
  } catch (_) {
    // ignore
  }
});

document.getElementById("btn-collector-start")?.addEventListener("click", () => {
  const fn = (monitorConfigSelect?.value || "").trim();
  if (!fn) {
    alert("请选择配置文件");
    return;
  }
  api("/api/collector/start", {
    method: "POST",
    body: JSON.stringify({ filename: fn }),
  })
    .then(() => pollMonitor())
    .catch((error) => alert(error.message));
});

document.getElementById("btn-collector-stop")?.addEventListener("click", () => {
  api("/api/collector/stop", { method: "POST", body: JSON.stringify({}) })
    .then(() => pollMonitor())
    .catch((error) => alert(error.message));
});

refreshMonitorFileList();
setInterval(pollMonitor, 2000);
pollMonitor();
