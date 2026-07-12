<template>
  <section v-if="available" class="settings-section">
    <h3 class="settings-section__title">启动</h3>
    <p class="settings-hint">
      控制登录系统后是否自动启动本软件，以及自启时是否不显示主窗口（托盘驻留，可随时打开）。
      仅桌面安装包生效；开发态可改开关但不会写入开机启动项。
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
      开启后：登录自启时不弹出主窗口，任务栏旁托盘可「打开主界面 / 退出」。手动双击快捷方式仍会正常显示窗口。
    </p>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }"
    >
      {{ msg }}
    </p>
    <p v-if="devNote" class="settings-hint">{{ devNote }}</p>
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
    prefs.value = await api.setLaunchSettings(patch);
    msg.value = "已保存";
    msgTone.value = "ok";
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
