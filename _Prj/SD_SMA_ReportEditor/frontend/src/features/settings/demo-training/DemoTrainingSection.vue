<template>
  <section class="settings-section">
    <h3 class="settings-section__title">演示与培训</h3>
    <p class="settings-hint">
      没有接入现场产线时，可以用<strong>远程演示服务器</strong>体验完整流程；网络不稳定时，可改用<strong>本地演示工具包</strong>（需先安装 Docker Desktop）。
      添加的演示连接会在「数据源配置」里标为「仿真」，与正式产线连接区分。
    </p>

    <div class="settings-field-row demo-channel-row">
      <span class="settings-field-label">演示通道</span>
      <select v-model="channel" class="settings-select" :disabled="busy" @change="onChannelChange">
        <option value="remote">远程演示服务器</option>
        <option value="local">本地工具包（127.0.0.1）</option>
      </select>
    </div>

    <div v-if="channel === 'remote'" class="demo-block">
      <p class="settings-hint settings-hint--muted">
        远程演示服务已随软件预置，无需填写地址或账号。请先点击「检测演示环境」，通过后再「一键添加演示连接」。
      </p>
      <p class="settings-hint settings-hint--muted">
        若检测失败，可能是演示服务正在维护或网络受限，可稍后再试，或改用下方的「本地演示工具包」。
      </p>
    </div>

    <div v-else class="demo-block">
      <p class="settings-hint">
        本地演示在本机运行，适合无法访问远程演示服务时使用。请先安装 Docker Desktop，再安装演示工具包并按说明启动。
      </p>
      <dl v-if="packState.installed" class="settings-meta">
        <div class="settings-meta-row">
          <dt>已安装工具包</dt>
          <dd>{{ packState.version || '—' }}</dd>
        </div>
        <div v-if="packState.installPath" class="settings-meta-row">
          <dt>路径</dt>
          <dd class="settings-meta-url">{{ packState.installPath }}</dd>
        </div>
      </dl>
      <div class="settings-actions demo-pack-actions">
        <button type="button" class="settings-btn" :disabled="busy || !electronShell" @click="checkDemoPack">
          检查工具包更新
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || !electronShell" @click="installDemoPack">
          {{ packCheck?.updateAvailable ? '下载并安装工具包' : '安装/更新工具包' }}
        </button>
      </div>
      <div v-if="packState.installed && electronShell" class="settings-actions demo-pack-actions">
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || composeBusy" @click="startDemoPack">
          启动演示环境
        </button>
        <button type="button" class="settings-btn" :disabled="busy || composeBusy" @click="stopDemoPack">
          停止演示环境
        </button>
      </div>
      <p v-if="packCheck?.notes" class="settings-hint settings-hint--muted">{{ packCheck.notes }}</p>
    </div>

    <div class="settings-actions settings-actions--spaced">
      <button type="button" class="settings-btn" :disabled="busy" @click="checkHealth">
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
const composeBusy = ref(false);
const msg = ref("");
const msgTone = ref("");
const channel = ref<"remote" | "local">("remote");

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
    parts.push(`演示数据库：${res.db?.ok ? "正常" : res.db?.message || "无法连接"}`);
    parts.push(`演示 OPC：${res.opcua?.ok ? "正常" : res.opcua?.message || "暂未开放"}`);
    healthSummary.value = parts.join("；");
    setMsg(
      res.ok ? "演示环境可用，可以添加演示连接。" : "演示环境暂不可用，请稍后再试或改用本地演示工具包。",
      res.ok ? "ok" : "warn",
    );
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
    })) as { ok?: boolean; db_id?: string; opc_id?: string | null; opc_skipped?: boolean };
    const hint = res.opc_skipped
      ? "已添加演示数据库连接。演示 OPC 尚未开放，可先在数据源中浏览演示库并完成报表练习。"
      : "已添加演示连接，请到「数据源配置」查看并测试。";
    setMsg(hint, "ok");
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
    setMsg(`演示工具包 ${res.version} 已安装。可点击「启动演示环境」，或按工具包说明手动运行脚本。`, "ok");
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

async function startDemoPack() {
  const api = window.electronAPI;
  if (!api?.startDemoPack) {
    setMsg("仅桌面安装版可启动演示环境。", "warn");
    return;
  }
  composeBusy.value = true;
  setMsg("", "");
  try {
    const res = await api.startDemoPack();
    if (!res.ok) {
      setMsg(res.error || "启动失败（请确认 Docker Desktop 已运行）", "err");
      void auditLog({ action: "demo.compose_start", result: "fail", summary: res.error || "启动失败" });
      return;
    }
    setMsg("演示环境已启动，请点击「检测演示环境」确认 DB/OPC 可用。", "ok");
    void auditLog({ action: "demo.compose_start", result: "ok", summary: "docker compose up" });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    composeBusy.value = false;
  }
}

async function stopDemoPack() {
  const api = window.electronAPI;
  if (!api?.stopDemoPack) {
    setMsg("仅桌面安装版可停止演示环境。", "warn");
    return;
  }
  composeBusy.value = true;
  setMsg("", "");
  try {
    const res = await api.stopDemoPack();
    if (!res.ok) {
      setMsg(res.error || "停止失败", "err");
      void auditLog({ action: "demo.compose_stop", result: "fail", summary: res.error || "停止失败" });
      return;
    }
    setMsg("演示环境已停止。", "ok");
    void auditLog({ action: "demo.compose_stop", result: "ok", summary: "docker compose down" });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    composeBusy.value = false;
  }
}

onMounted(async () => {
  await loadPrefs();
  await refreshPackState();
});
</script>

<style scoped>
.demo-block {
  margin-bottom: 4px;
}

.demo-channel-row {
  max-width: 100%;
}

.demo-pack-actions {
  margin-top: 4px;
}
</style>
