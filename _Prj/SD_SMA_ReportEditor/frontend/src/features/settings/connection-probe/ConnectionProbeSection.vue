<template>
  <section class="settings-section">
    <h3 class="settings-section__title">连接定时探活</h3>
    <p class="settings-hint">
      开启后，软件会按设定间隔在后台检测已保存的数据库与 OPC UA 连接，并在数据源页 Tab 指示灯上反映结果。
      弱网或现场带宽紧张时可关闭，改用手动「测试连接」。
    </p>

    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.enabled ? 'true' : 'false'"
        @click="toggleEnabled"
      >
        <span class="settings-switch-track" :class="{ on: prefs.enabled }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">启用定时探活</span>
      </button>
    </div>

    <div class="settings-field-row" :class="{ 'settings-field-row--muted': !prefs.enabled }">
      <span class="settings-field-label">探活间隔（秒）</span>
      <input
        v-model.number="intervalLocal"
        type="number"
        class="settings-input settings-input--narrow"
        min="10"
        max="3600"
        step="1"
        :disabled="!prefs.enabled || busy"
        @change="onIntervalChange"
      />
      <span class="settings-field-hint">10–3600，默认 30</span>
    </div>

    <p v-if="msg" class="settings-msg" :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }">
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  DEFAULT_CONNECTION_PROBE_PREFS,
  loadConnectionProbePrefs,
  saveConnectionProbePrefs,
  type ConnectionProbePrefs,
} from "@/features/datasource/connection-probe-prefs";

const prefs = ref<ConnectionProbePrefs>({ ...DEFAULT_CONNECTION_PROBE_PREFS });
const intervalLocal = ref(DEFAULT_CONNECTION_PROBE_PREFS.intervalSec);
const busy = ref(false);
const msg = ref("");
const msgTone = ref("");

async function reloadFromServer(opts?: { announceAi?: boolean }) {
  const loaded = await loadConnectionProbePrefs();
  prefs.value = loaded;
  intervalLocal.value = loaded.intervalSec;
  if (opts?.announceAi) {
    msg.value = loaded.enabled ? "已由 AI 开启定时探活" : "已由 AI 更新探活设置";
    msgTone.value = "ok";
  }
}

async function persist(next: ConnectionProbePrefs) {
  busy.value = true;
  msg.value = "";
  msgTone.value = "";
  try {
    await saveConnectionProbePrefs(next);
    prefs.value = next;
    intervalLocal.value = next.intervalSec;
    msg.value = "已保存";
    msgTone.value = "ok";
    window.dispatchEvent(new CustomEvent("report-editor-connection-probe-changed", { detail: next }));
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e);
    msgTone.value = "err";
  } finally {
    busy.value = false;
  }
}

function toggleEnabled() {
  void persist({ ...prefs.value, enabled: !prefs.value.enabled });
}

function onIntervalChange() {
  let n = Number(intervalLocal.value);
  if (!Number.isFinite(n)) n = DEFAULT_CONNECTION_PROBE_PREFS.intervalSec;
  n = Math.max(10, Math.min(3600, Math.floor(n)));
  intervalLocal.value = n;
  if (n === prefs.value.intervalSec) return;
  void persist({ ...prefs.value, intervalSec: n });
}

function onProbeChanged(ev: Event) {
  const detail = (ev as CustomEvent).detail as { via?: string } | ConnectionProbePrefs | undefined;
  // 本组件手动保存已同步本地 state；仅 AI/外部写入时回读服务端
  if (detail && typeof detail === "object" && "via" in detail && detail.via === "ai") {
    void reloadFromServer({ announceAi: true });
    return;
  }
  if (detail && typeof detail === "object" && "enabled" in detail) {
    prefs.value = detail as ConnectionProbePrefs;
    intervalLocal.value = (detail as ConnectionProbePrefs).intervalSec;
  }
}

onMounted(() => {
  void reloadFromServer();
  window.addEventListener("report-editor-connection-probe-changed", onProbeChanged);
});

onUnmounted(() => {
  window.removeEventListener("report-editor-connection-probe-changed", onProbeChanged);
});
</script>

<style scoped>
.settings-field-row--muted {
  opacity: 0.55;
}
</style>
