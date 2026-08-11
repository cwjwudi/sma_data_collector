<template>
  <section class="settings-section">
    <h3 class="settings-section__title">启动</h3>
    <p v-if="!available" class="settings-hint settings-hint--muted">
      开机自启与静默启动仅桌面安装版可用；局域网浏览器无需配置此项。
    </p>
    <template v-else>
    <p class="settings-hint">
      控制登录系统后是否自动启动本软件，以及是否不显示主窗口（托盘驻留，可随时打开）。
      「静默无页面启动」对开机自启与手动双击均生效。仅桌面安装包完整生效；开发态可改开关但不会写入开机启动项。
    </p>

    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.openAtLogin ? 'true' : 'false'"
        :disabled="busy"
        @click="toggleOpenAtLogin"
      >
        <span class="settings-switch-track" :class="{ on: prefs.openAtLogin }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">开机自启动</span>
      </button>
    </div>

    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.silentStart ? 'true' : 'false'"
        :disabled="busy"
        @click="toggleSilentStart"
      >
        <span class="settings-switch-track" :class="{ on: prefs.silentStart }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">静默无页面启动</span>
      </button>
    </div>
    <p class="settings-field-hint">
      开启后：任意启动（含手动双击、开机自启）均不弹出主窗口。Windows 可在托盘图标右键「打开主界面 /
      退出」；macOS 可点 Dock 图标，或点顶部菜单栏托盘图标「打开主界面 / 退出」。关闭后下次启动恢复显示窗口。
    </p>

    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.exportOverlayEnabled === false ? 'false' : 'true'"
        :disabled="busy"
        @click="toggleExportOverlay"
      >
        <span class="settings-switch-track" :class="{ on: prefs.exportOverlayEnabled !== false }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">导出时全屏遮罩</span>
      </button>
    </div>
    <p class="settings-field-hint">
      结批 / 导出期间全屏显示「正在生成报表」遮罩（盖住任务栏 / Dock 与同机 mappView
      白屏）。每份报表开始时重新计 120 秒；可按 Esc 或点右上角 × 关闭。遮罩页可导出问题反馈包。
    </p>

    <div v-if="prefs.exportOverlayEnabled !== false" class="settings-overlay-opts">
      <label class="settings-field-label" for="ov-display">遮罩显示屏</label>
      <select
        id="ov-display"
        class="settings-select"
        :disabled="busy"
        :value="prefs.exportOverlayDisplay || 'primary'"
        @change="onDisplayChange"
      >
        <option value="primary">主显示器</option>
        <option value="secondary">副显示器（无副屏则回落主屏）</option>
        <option value="all">全部显示器</option>
      </select>

      <label class="settings-field-label" for="ov-trigger">弹出时机</label>
      <select
        id="ov-trigger"
        class="settings-select"
        :disabled="busy"
        :value="prefs.exportOverlayTrigger || 'always'"
        @change="onTriggerChange"
      >
        <option value="always">全部导出（手动 + 自动结批）</option>
        <option value="autoOnly">仅自动结批</option>
      </select>
      <p class="settings-field-hint">
        工控机通常单屏选「主显示器」即可。若仅希望结批时遮罩、手动导出不挡编辑器，选「仅自动结批」。
      </p>
    </div>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }"
    >
      {{ msg }}
    </p>
    <p v-if="devNote" class="settings-hint">{{ devNote }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

defineOptions({ name: "LaunchSettingsSection" });

type OverlayDisplay = "primary" | "secondary" | "all";
type OverlayTrigger = "always" | "autoOnly";

type LaunchPrefs = {
  openAtLogin: boolean;
  silentStart: boolean;
  exportOverlayEnabled?: boolean;
  exportOverlayDisplay?: OverlayDisplay;
  exportOverlayTrigger?: OverlayTrigger;
  packaged?: boolean;
  silentStartSession?: boolean;
  execPath?: string;
  loginCommand?: string | null;
  loginApplied?: boolean;
  loginSkipped?: boolean;
  loginError?: string | null;
  loginRemovedLegacy?: string[];
};

const available = ref(false);
const busy = ref(false);
const msg = ref("");
const msgTone = ref<"ok" | "err" | "">("");
const prefs = ref<LaunchPrefs>({
  openAtLogin: false,
  silentStart: false,
  exportOverlayEnabled: true,
  exportOverlayDisplay: "primary",
  exportOverlayTrigger: "always",
});

const devNote = computed(() => {
  if (prefs.value.packaged === false) {
    return "当前为开发/未打包运行：偏好已保存，但不会注册系统开机启动项。";
  }
  return "";
});

async function load() {
  const api = window.electronAPI;
  if (!api?.getLaunchSettings || !api?.setLaunchSettings) {
    available.value = false;
    return;
  }
  available.value = true;
  try {
    prefs.value = await api.getLaunchSettings();
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e);
    msgTone.value = "err";
  }
}

async function persist(patch: Partial<LaunchPrefs>) {
  const api = window.electronAPI;
  if (!api?.setLaunchSettings) return;
  busy.value = true;
  msg.value = "";
  msgTone.value = "";
  try {
    const next = await api.setLaunchSettings(patch);
    prefs.value = next;
    const cleaned = next.loginRemovedLegacy?.length
      ? `（已清理旧的重复自启项：${next.loginRemovedLegacy.join("、")}）`
      : "";
    if (next.loginError) {
      msg.value = `偏好已保存，但登录项同步失败：${next.loginError}`;
      msgTone.value = "err";
    } else if (next.packaged === false || next.loginSkipped) {
      msg.value = "已保存（当前不会写入系统开机启动项）";
      msgTone.value = "ok";
    } else if (next.openAtLogin && next.loginCommand) {
      msg.value = `已保存并注册开机启动：${next.loginCommand}${cleaned}`;
      msgTone.value = "ok";
    } else {
      msg.value = `已保存${cleaned}`;
      msgTone.value = "ok";
    }
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e);
    msgTone.value = "err";
  } finally {
    busy.value = false;
  }
}

function toggleOpenAtLogin() {
  void persist({ openAtLogin: !prefs.value.openAtLogin });
}

function toggleSilentStart() {
  void persist({ silentStart: !prefs.value.silentStart });
}

function toggleExportOverlay() {
  void persist({ exportOverlayEnabled: prefs.value.exportOverlayEnabled === false });
}

function onDisplayChange(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value as OverlayDisplay;
  void persist({ exportOverlayDisplay: v });
}

function onTriggerChange(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value as OverlayTrigger;
  void persist({ exportOverlayTrigger: v });
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.settings-overlay-opts {
  display: grid;
  gap: 8px;
  margin: 4px 0 12px;
  max-width: 420px;
}
.settings-field-label {
  font-size: 13px;
  color: var(--settings-muted, #64748b);
  margin-top: 4px;
}
.settings-select {
  appearance: auto;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  background: var(--settings-input-bg, #fff);
  color: inherit;
  font-size: 13px;
}
</style>
