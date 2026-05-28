<template>
  <div v-if="visible" class="sidebar-update" aria-live="polite">
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
        :class="{ 'sidebar-update__bar--indeterminate': appUpdateDownloadPercent == null && appUpdateDownloading }"
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

const isElectron = computed(() => Boolean(window.electronAPI?.checkAppUpdate))

const visible = computed(
  () =>
    isElectron.value &&
    (appUpdateDownloading.value ||
      appUpdateDownloadPaused.value ||
      appUpdateDownloadedReady.value),
)

const showProgress = computed(
  () => appUpdateDownloading.value || appUpdateDownloadPaused.value || appUpdateDownloadedReady.value,
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
    const elapsedSec = (Date.now() - startedAt) / 1000
    const remainingSec = (total - received) / speed
    parts.push(`剩余约 ${formatUpdateDuration(remainingSec)}`)
  }
  return parts.join(' · ')
})

const installBusy = ref(false)

async function onPause() {
  await cancelAppUpdateDownload()
}

async function onResume() {
  await startAppUpdateDownload()
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

@keyframes sidebar-update-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}
</style>
