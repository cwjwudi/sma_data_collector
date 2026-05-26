<template>
  <section class="settings-section">
    <h3 class="settings-section__title">开发者工具（DevTools）</h3>
    <p class="settings-hint">
      控制 Electron 桌面窗口内嵌的 Chromium 调试面板（默认<strong>关闭</strong>，开启后停靠在窗口<strong>右侧</strong>）。偏好保存在本机
      localStorage。若在浏览器中预览，开关仍可点击以<strong>记录偏好</strong>，下次用桌面版启动时会生效；要立刻调试页面请用
      F12。
    </p>
    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="devtoolsOpen ? 'true' : 'false'"
        @click="toggle"
      >
        <span class="settings-switch-track" :class="{ on: devtoolsOpen }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">显示右侧开发者工具</span>
      </button>
    </div>
    <p v-if="!isElectronShell" class="settings-note">
      检测到当前为<strong>浏览器</strong>运行：此处<strong>不会</strong>弹出应用内调试面板；请用 F12 / 右键「检查」。使用仓库脚本或
      <code>npm run electron:dev:unix</code>
      打开 Electron 窗口后，本开关才会实际控制右侧 DevTools。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useElectronDevtoolsPrefs } from "@/composables/useElectronDevtoolsPrefs";

const { devtoolsOpen } = useElectronDevtoolsPrefs();

const isElectronShell = computed(() => typeof window !== "undefined" && Boolean(window.electronAPI?.setDevtoolsOpen));

function toggle() {
  devtoolsOpen.value = !devtoolsOpen.value;
}
</script>
