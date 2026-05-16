<template>
  <section class="card muted-card">
    <h3>开发者工具（DevTools）</h3>
    <p class="hint">
      控制 Electron 桌面窗口内嵌的 Chromium 调试面板（默认停靠在窗口<strong>右侧</strong>）。偏好保存在本机
      localStorage。若在浏览器中预览，开关仍可点击以<strong>记录偏好</strong>，下次用桌面版启动时会生效；要立刻调试页面请用
      F12。
    </p>
    <div class="row-switch">
      <button
        type="button"
        class="switch-touch"
        role="switch"
        :aria-checked="devtoolsOpen ? 'true' : 'false'"
        @click="toggle"
      >
        <span class="switch-track" :class="{ on: devtoolsOpen }">
          <span class="switch-thumb" />
        </span>
        <span class="switch-label">显示右侧开发者工具</span>
      </button>
    </div>
    <p v-if="!isElectronShell" class="muted-note">
      检测到当前为<strong>浏览器</strong>运行：此处<strong>不会</strong>弹出应用内调试面板；请用 F12 / 右键「检查」。使用仓库脚本或
      <code class="code">npm run electron:dev:unix</code>
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

<style scoped>
.muted-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  margin-top: 16px;
}
.hint {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.45;
  margin-bottom: 16px;
}
.row-switch {
  margin-bottom: 8px;
}
.switch-touch {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  -webkit-tap-highlight-color: transparent;
}
.switch-track {
  flex-shrink: 0;
  width: 52px;
  height: 32px;
  border-radius: 16px;
  background: #d1d5db;
  position: relative;
  transition: background 0.15s ease;
}
.switch-track.on {
  background: #4f46e5;
}
.switch-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  transition: transform 0.15s ease;
}
.switch-track.on .switch-thumb {
  transform: translateX(20px);
}
.switch-label {
  font-size: 15px;
  color: #374151;
  line-height: 1.4;
}
.muted-note {
  margin: 8px 0 0;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.45;
}
.muted-note .code {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #4b5563;
}
</style>
