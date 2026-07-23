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

type LaunchPrefs = {
  openAtLogin: boolean;
  silentStart: boolean;
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
const prefs = ref<LaunchPrefs>({ openAtLogin: false, silentStart: false });

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

onMounted(() => {
  void load();
});
</script>
