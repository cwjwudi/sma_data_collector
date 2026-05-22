<template>
  <section class="settings-section">
    <h3 class="settings-section__title">演示与培训</h3>
    <p class="settings-hint">
      无现场产线时，可连接<strong>远程演示服务器</strong>（默认），或在网络不佳时安装<strong>本地演示工具包</strong>（需本机 Docker Desktop）。
      演示连接会在数据源页 Tab 上标「仿真」，与生产连接区分。
    </p>

    <div class="settings-field-row">
      <span class="settings-field-label">演示通道</span>
      <select v-model="channel" class="settings-select" :disabled="busy" @change="onChannelChange">
        <option value="remote">远程演示服务器</option>
        <option value="local">本地工具包（127.0.0.1）</option>
      </select>
    </div>

    <div v-if="channel === 'remote'" class="demo-remote-fields">
      <p class="settings-hint settings-hint--muted">由团队维护的演示 DB/OPC；保存后用于健康检查与一键添加连接。</p>
      <label class="demo-field">
        <span>数据库主机</span>
        <input v-model="remoteDbHost" class="settings-input" type="text" placeholder="demo.example.com" :disabled="busy" />
      </label>
      <label class="demo-field">
        <span>数据库端口</span>
        <input v-model.number="remoteDbPort" class="settings-input settings-input--narrow" type="number" :disabled="busy" />
      </label>
      <label class="demo-field">
        <span>数据库名 / 用户 / 密码</span>
        <div class="demo-inline">
          <input v-model="remoteDbName" class="settings-input" placeholder="report" :disabled="busy" />
          <input v-model="remoteDbUser" class="settings-input" placeholder="demo" :disabled="busy" />
          <input v-model="remoteDbPassword" class="settings-input" type="password" placeholder="密码" :disabled="busy" />
        </div>
      </label>
      <label class="demo-field">
        <span>OPC UA Endpoint</span>
        <input
          v-model="remoteOpcEndpoint"
          class="settings-input"
          type="text"
          placeholder="opc.tcp://host:4840/..."
          :disabled="busy"
        />
      </label>
      <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="saveRemotePrefs">
        保存远程演示地址
      </button>
    </div>

    <div v-else class="demo-local-block">
      <p class="settings-hint">
        本地通道使用 <code>127.0.0.1:3306</code> 与 <code>4840</code>（与工具包内 docker-compose 一致）。请先安装 Docker Desktop 并安装工具包。
      </p>
      <dl v-if="packState.installed" class="update-meta">
        <div class="update-meta-row">
          <dt>已安装工具包</dt>
          <dd>{{ packState.version || '—' }}</dd>
        </div>
        <div v-if="packState.installPath" class="update-meta-row">
          <dt>路径</dt>
          <dd class="update-meta-url">{{ packState.installPath }}</dd>
        </div>
      </dl>
      <div class="demo-actions">
        <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy || !electronShell" @click="checkDemoPack">
          检查工具包更新
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || !electronShell" @click="installDemoPack">
          {{ packCheck?.updateAvailable ? '下载并安装工具包' : '安装/更新工具包' }}
        </button>
      </div>
      <p v-if="packCheck?.notes" class="settings-hint settings-hint--muted">{{ packCheck.notes }}</p>
    </div>

    <div class="demo-actions">
      <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="checkHealth">
        检测演示环境
      </button>
      <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="applyDemo">
        一键添加演示连接
      </button>
    </div>

    <p v-if="healthSummary" class="settings-hint" :class="{ 'settings-hint--warn': !healthOk }">{{ healthSummary }}</p>
    <p
      v-if="msg"
      class="settings-msg"
      :class="{
        'settings-msg--ok': msgTone === 'ok',
        'settings-msg--warn': msgTone === 'warn',
        'settings-msg--err': msgTone === 'err',
      }"
    >
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { apiFetch } from "@/api/client.js";
import { auditLog } from "@/lib/auditLog";

const busy = ref(false);
const msg = ref("");
const msgTone = ref("");
const channel = ref<"remote" | "local">("remote");

const remoteDbHost = ref("");
const remoteDbPort = ref(3306);
const remoteDbName = ref("report");
const remoteDbUser = ref("demo");
const remoteDbPassword = ref("");
const remoteOpcEndpoint = ref("");

const healthSummary = ref("");
const healthOk = ref(false);

const packState = ref<{ installed: boolean; version: string; installPath: string }>({
  installed: false,
  version: "",
  installPath: "",
});
const packCheck = ref<{
  ok?: boolean;
  updateAvailable?: boolean;
  version?: string;
  notes?: string;
  error?: string;
} | null>(null);

const electronShell = computed(() => typeof window !== "undefined" && Boolean(window.electronAPI?.installDemoPack));

function setMsg(text: string, tone: string) {
  msg.value = text;
  msgTone.value = tone;
}

async function loadPrefs() {
  try {
    const prefs = (await apiFetch("/settings/app_preferences")) as Record<string, unknown>;
    const ch = String(prefs.demo_preferred_channel || "remote");
    channel.value = ch === "local" ? "local" : "remote";
    remoteDbHost.value = String(prefs.demo_remote_db_host || "");
    remoteDbPort.value = Number(prefs.demo_remote_db_port) || 3306;
    remoteDbName.value = String(prefs.demo_remote_db_name || "report");
    remoteDbUser.value = String(prefs.demo_remote_db_user || "demo");
    remoteDbPassword.value = String(prefs.demo_remote_db_password || "");
    remoteOpcEndpoint.value = String(prefs.demo_remote_opcua_endpoint || "");
  } catch {
    /* ignore */
  }
}

async function refreshPackState() {
  const api = window.electronAPI;
  if (!api?.getDemoPackState) return;
  try {
    packState.value = await api.getDemoPackState();
  } catch {
    packState.value = { installed: false, version: "", installPath: "" };
  }
}

async function saveRemotePrefs() {
  busy.value = true;
  setMsg("", "");
  try {
    await apiFetch("/settings/app_preferences", {
      method: "PATCH",
      body: {
        demo_preferred_channel: channel.value,
        demo_remote_db_host: remoteDbHost.value.trim(),
        demo_remote_db_port: remoteDbPort.value,
        demo_remote_db_name: remoteDbName.value.trim(),
        demo_remote_db_user: remoteDbUser.value.trim(),
        demo_remote_db_password: remoteDbPassword.value,
        demo_remote_opcua_endpoint: remoteOpcEndpoint.value.trim(),
      },
    });
    setMsg("远程演示地址已保存。", "ok");
    void auditLog({ action: "demo.config_save", summary: "保存远程演示地址", result: "ok" });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

function onChannelChange() {
  void apiFetch("/settings/app_preferences", {
    method: "PATCH",
    body: { demo_preferred_channel: channel.value },
  }).catch(() => {});
}

async function checkHealth() {
  busy.value = true;
  healthSummary.value = "";
  setMsg("", "");
  try {
    const res = (await apiFetch(`/demo/health?channel=${encodeURIComponent(channel.value)}`)) as {
      ok?: boolean;
      db?: { ok?: boolean; message?: string };
      opcua?: { ok?: boolean; message?: string };
    };
    healthOk.value = Boolean(res.ok);
    const parts: string[] = [];
    parts.push(`数据库：${res.db?.ok ? "正常" : res.db?.message || "失败"}`);
    parts.push(`OPC UA：${res.opcua?.ok ? "正常" : res.opcua?.message || "失败"}`);
    healthSummary.value = parts.join("；");
    setMsg(res.ok ? "演示环境可用。" : "演示环境不可用，请检查网络或本地 Docker。", res.ok ? "ok" : "warn");
    void auditLog({
      action: "demo.health_check",
      result: res.ok ? "ok" : "fail",
      summary: healthSummary.value,
      detail: { channel: channel.value },
    });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

async function applyDemo() {
  busy.value = true;
  setMsg("", "");
  try {
    const res = (await apiFetch("/demo/apply_connections", {
      method: "POST",
      body: { channel: channel.value },
    })) as { ok?: boolean; db_id?: string; opc_id?: string };
    setMsg("已添加演示连接，请到「数据源配置」测试并浏览变量。", "ok");
    window.dispatchEvent(new CustomEvent("report-editor-config-imported"));
    void auditLog({
      action: "demo.apply_connections",
      result: "ok",
      summary: `通道 ${channel.value}`,
      detail: { db_id: res.db_id, opc_id: res.opc_id },
    });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
    void auditLog({
      action: "demo.apply_connections",
      result: "fail",
      summary: e instanceof Error ? e.message : String(e),
      detail: { channel: channel.value },
    });
  } finally {
    busy.value = false;
  }
}

async function checkDemoPack() {
  const api = window.electronAPI;
  if (!api?.checkDemoPack) {
    setMsg("仅桌面安装版可下载演示工具包。", "warn");
    return;
  }
  busy.value = true;
  setMsg("", "");
  try {
    packCheck.value = await api.checkDemoPack();
    if (!packCheck.value?.ok) {
      setMsg(packCheck.value?.error || "检查失败", "err");
      return;
    }
    setMsg(
      packCheck.value.updateAvailable
        ? `发现工具包 ${packCheck.value.version}，可安装。`
        : `已是最新工具包 ${packCheck.value.version || packState.value.version || ""}。`,
      "ok",
    );
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

async function installDemoPack() {
  const api = window.electronAPI;
  if (!api?.installDemoPack) {
    setMsg("仅桌面安装版可安装演示工具包。", "warn");
    return;
  }
  busy.value = true;
  setMsg("", "");
  try {
    const res = await api.installDemoPack();
    if (!res.ok) {
      setMsg(res.error || "安装失败", "err");
      void auditLog({ action: "demo.pack_install", result: "fail", summary: res.error || "安装失败" });
      return;
    }
    await refreshPackState();
    channel.value = "local";
    await onChannelChange();
    setMsg(`演示工具包 ${res.version} 已安装。请在本机 Docker 中运行工具包内 start 脚本后检测环境。`, "ok");
    void auditLog({
      action: "demo.pack_install",
      result: "ok",
      summary: `版本 ${res.version}`,
      detail: { path: res.installPath },
    });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadPrefs();
  await refreshPackState();
});
</script>

<style scoped>
.demo-remote-fields {
  margin: 12px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 560px;
}
.demo-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.demo-field span {
  color: #374151;
  font-weight: 500;
}
.demo-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.demo-inline .settings-input {
  flex: 1 1 120px;
}
.settings-input--narrow {
  width: 88px;
}
.demo-local-block {
  margin: 12px 0 16px;
}
.demo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.settings-hint--muted {
  color: #6b7280;
}
.settings-hint--warn {
  color: #92400e;
}
.demo-field code,
.settings-hint code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
