<template>
  <div
    v-if="visible"
    class="sidebar-update"
    :class="{ 'sidebar-update--collapsed': collapsed }"
    aria-live="polite"
  >
    <template v-if="!collapsed">
      <p v-if="headingText" class="sidebar-update__heading">{{ headingText }}</p>
      <div
        v-if="showProgress"
        class="sidebar-update__track"
        role="progressbar"
        :aria-valuenow="progressAriaValue"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="sidebar-update__bar"
          :class="{
            'sidebar-update__bar--indeterminate':
              appUpdateDownloadPercent == null && appUpdateDownloading,
          }"
          :style="progressBarStyle"
        />
      </div>
      <p v-if="statsText" class="sidebar-update__stats">{{ statsText }}</p>
      <div class="sidebar-update__actions">
        <button
          v-if="appUpdateDownloading"
          type="button"
          class="sidebar-update__btn sidebar-update__btn--ghost"
          @click="onPause"
        >
          暂停
        </button>
        <button
          v-if="appUpdateDownloadPaused"
          type="button"
          class="sidebar-update__btn sidebar-update__btn--ghost"
          @click="onResume"
        >
          继续下载
        </button>
        <button
          v-if="appUpdateDownloadedReady"
          type="button"
          class="sidebar-update__btn sidebar-update__btn--primary"
          :disabled="installBusy"
          @click="onInstall"
        >
          {{ installBusy ? '正在启动…' : '立即安装' }}
        </button>
      </div>
    </template>

    <button
      v-else
      type="button"
      class="sidebar-update__orb"
      :class="`sidebar-update__orb--${orbMode}`"
      :title="orbTooltip"
      :aria-label="orbAriaLabel"
      :disabled="installBusy && orbMode === 'install'"
      @click="onOrbClick"
    >
      <svg class="sidebar-update__orb-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="sidebar-update__orb-ring-bg" cx="18" cy="18" r="15" />
        <circle
          v-if="orbRingDasharray"
          class="sidebar-update__orb-ring-fg"
          cx="18"
          cy="18"
          r="15"
          :style="{ strokeDasharray: orbRingDasharray }"
        />
      </svg>
      <span class="sidebar-update__orb-icon sidebar-update__orb-icon--default" aria-hidden="true">
        <svg v-if="orbMode === 'install'" class="sidebar-update__glyph" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v10M8 9l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <svg v-else class="sidebar-update__glyph" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v11M8 11l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </span>
      <span class="sidebar-update__orb-icon sidebar-update__orb-icon--hover" aria-hidden="true">
        <svg v-if="orbMode === 'install'" class="sidebar-update__glyph" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 21H5a2 2 0 01-2-2V9l7-5 7 5v10a2 2 0 01-2 2z" opacity="0.3" />
          <path d="M12 7v8M9 12h6" stroke="currentColor" stroke-width="2" fill="none" />
        </svg>
        <svg v-else-if="orbMode === 'paused'" class="sidebar-update__glyph" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        <svg v-else class="sidebar-update__glyph" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { auditLog } from '@/lib/auditLog'
import {
  formatUpdateBytes,
  formatUpdateDuration,
  formatUpdateSpeed,
} from './appUpdateFormat'
import {
  appUpdateDownloadedReady,
  appUpdateDownloading,
  appUpdateDownloadPaused,
  appUpdateDownloadPercent,
  appUpdateDownloadReceived,
  appUpdateDownloadSpeedBps,
  appUpdateDownloadStartedAt,
  appUpdateDownloadTotal,
  appUpdateLatestVersion,
  appUpdateProgressTick,
  cancelAppUpdateDownload,
  installAppUpdate,
  startAppUpdateDownload,
} from './appUpdateState'

const props = defineProps<{
  collapsed?: boolean
}>()

const collapsed = computed(() => Boolean(props.collapsed))

const isElectron = computed(() => Boolean(window.electronAPI?.checkAppUpdate))

const visible = computed(
  () =>
    isElectron.value &&
    (appUpdateDownloading.value ||
      appUpdateDownloadPaused.value ||
      appUpdateDownloadedReady.value),
)

const showProgress = computed(
  () =>
    appUpdateDownloading.value ||
    appUpdateDownloadPaused.value ||
    appUpdateDownloadedReady.value,
)

const headingText = computed(() => {
  const ver = appUpdateLatestVersion.value
  if (appUpdateDownloadedReady.value) {
    return ver ? `新版本 ${ver} 已就绪` : '新版本已就绪'
  }
  if (appUpdateDownloadPaused.value) return '下载已暂停'
  if (appUpdateDownloading.value) {
    return ver ? `正在下载 ${ver}` : '正在下载新版本'
  }
  return ''
})

const progressAriaValue = computed(() => {
  const p = appUpdateDownloadPercent.value
  return p != null ? Math.round(p) : undefined
})

const progressBarStyle = computed(() => {
  const p = appUpdateDownloadPercent.value
  if (p != null) return { width: `${p}%` }
  return undefined
})

const statsText = computed(() => {
  void appUpdateProgressTick.value
  const received = appUpdateDownloadReceived.value
  const total = appUpdateDownloadTotal.value
  const speed = appUpdateDownloadSpeedBps.value
  const startedAt = appUpdateDownloadStartedAt.value
  const paused = appUpdateDownloadPaused.value
  const downloading = appUpdateDownloading.value
  const ready = appUpdateDownloadedReady.value

  if (ready && total > 0) return formatUpdateBytes(total)
  if (!downloading && !paused) return ''

  const sizePart =
    total > 0
      ? `${formatUpdateBytes(received)} / ${formatUpdateBytes(total)}`
      : received > 0
        ? formatUpdateBytes(received)
        : ''

  const parts: string[] = []
  if (sizePart) parts.push(sizePart)
  if (downloading && speed != null && speed > 0) parts.push(formatUpdateSpeed(speed))
  if (startedAt && downloading && total > received && speed != null && speed > 0) {
    const remainingSec = (total - received) / speed
    parts.push(`剩余约 ${formatUpdateDuration(remainingSec)}`)
  }
  return parts.join(' · ')
})

type OrbMode = 'download' | 'paused' | 'install'

const orbMode = computed<OrbMode>(() => {
  if (appUpdateDownloadedReady.value) return 'install'
  if (appUpdateDownloadPaused.value) return 'paused'
  return 'download'
})

const ORB_CIRCUMFERENCE = 2 * Math.PI * 15

const orbRingDasharray = computed(() => {
  if (orbMode.value === 'install') {
    return `${ORB_CIRCUMFERENCE} ${ORB_CIRCUMFERENCE}`
  }
  const p = appUpdateDownloadPercent.value
  if (p != null) {
    const filled = (Math.min(100, Math.max(0, p)) / 100) * ORB_CIRCUMFERENCE
    return `${filled} ${ORB_CIRCUMFERENCE}`
  }
  if (appUpdateDownloading.value) {
    return `${ORB_CIRCUMFERENCE * 0.35} ${ORB_CIRCUMFERENCE}`
  }
  return undefined
})

const orbTooltip = computed(() => {
  const lines = [headingText.value, statsText.value].filter(Boolean)
  if (orbMode.value === 'download') lines.push('悬停：暂停')
  if (orbMode.value === 'paused') lines.push('悬停：继续下载')
  if (orbMode.value === 'install') lines.push('点击：立即安装')
  return lines.join('\n')
})

const orbAriaLabel = computed(() => {
  if (orbMode.value === 'install') return installBusy.value ? '正在启动安装' : '立即安装新版本'
  if (orbMode.value === 'paused') return '继续下载'
  return '暂停下载'
})

const installBusy = ref(false)

async function onPause() {
  await cancelAppUpdateDownload()
}

async function onResume() {
  await startAppUpdateDownload()
}

function onOrbClick() {
  if (orbMode.value === 'install') {
    void onInstall()
    return
  }
  if (orbMode.value === 'paused') {
    void onResume()
    return
  }
  void onPause()
}

async function onInstall() {
  const backupHint =
    '建议在「设置 → 配置导入/导出」中先导出本机备份。\n\n0.1.11 起 Windows 覆盖升级会保留数据库 / OPC UA 配置与模版；仍建议重要环境升级前备份。'
  if (
    !window.confirm(
      `即将退出本软件并启动升级流程，未保存的编辑请先保存。\n\n${backupHint}\n\n是否继续？`,
    )
  ) {
    return
  }
  installBusy.value = true
  try {
    const api = window.electronAPI
    const platform = (await api?.getAppUpdateConfig?.())?.platform || ''
    const isMac = platform.startsWith('darwin')
    const res = await installAppUpdate({
      openAfterUpgrade: isMac ? true : undefined,
    })
    if (!res?.ok) {
      window.alert(res?.error || '启动升级失败')
      void auditLog({ action: 'update.install', result: 'fail', summary: res?.error || '启动升级失败' })
      return
    }
    void auditLog({ action: 'update.install', result: 'ok', summary: res.message || '已启动升级' })
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e))
  } finally {
    installBusy.value = false
  }
}
</script>

<style scoped>
.sidebar-update {
  flex-shrink: 0;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.15);
}

.sidebar-update--collapsed {
  padding: 10px 0 14px;
  display: flex;
  justify-content: center;
  border-top-color: rgba(255, 255, 255, 0.08);
}

.sidebar-update__heading {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: #c7d2fe;
  line-height: 1.35;
}

.sidebar-update__track {
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 6px;
}

.sidebar-update__bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 999px;
  transition: width 0.2s ease;
}

.sidebar-update__bar--indeterminate {
  width: 40% !important;
  animation: sidebar-update-indeterminate 1.2s ease-in-out infinite;
}

.sidebar-update__stats {
  margin: 0 0 8px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: #94a3b8;
  line-height: 1.4;
}

.sidebar-update__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sidebar-update__btn {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sidebar-update__btn--ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}

.sidebar-update__btn--ghost:hover {
  background: rgba(255, 255, 255, 0.14);
}

.sidebar-update__btn--primary {
  background: #6366f1;
  color: #fff;
}

.sidebar-update__btn--primary:hover:not(:disabled) {
  background: #4f46e5;
}

.sidebar-update__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sidebar-update__orb {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.sidebar-update__orb:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.38);
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.45);
  transform: scale(1.04);
}

.sidebar-update__orb--install {
  background: rgba(34, 197, 94, 0.22);
  color: #86efac;
}

.sidebar-update__orb--install:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.38);
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.45);
}

.sidebar-update__orb--paused {
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
}

.sidebar-update__orb-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.sidebar-update__orb-ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 2.5;
}

.sidebar-update__orb-ring-fg {
  fill: none;
  stroke: #818cf8;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dasharray 0.2s ease;
}

.sidebar-update__orb--install .sidebar-update__orb-ring-fg {
  stroke: #4ade80;
}

.sidebar-update__orb--download .sidebar-update__orb-ring-fg {
  animation: sidebar-orb-pulse 1.2s ease-in-out infinite;
}

.sidebar-update__glyph {
  width: 16px;
  height: 16px;
  display: block;
}

.sidebar-update__orb-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.sidebar-update__orb-icon--hover {
  opacity: 0;
}

.sidebar-update__orb:hover:not(:disabled) .sidebar-update__orb-icon--default {
  opacity: 0;
}

.sidebar-update__orb:hover:not(:disabled) .sidebar-update__orb-icon--hover {
  opacity: 1;
}

.sidebar-update__orb--install .sidebar-update__orb-icon--default {
  opacity: 1;
}

.sidebar-update__orb--install:hover:not(:disabled) .sidebar-update__orb-icon--default {
  opacity: 0;
}

.sidebar-update__orb--install:hover:not(:disabled) .sidebar-update__orb-icon--hover {
  opacity: 1;
}

@keyframes sidebar-update-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

@keyframes sidebar-orb-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>
