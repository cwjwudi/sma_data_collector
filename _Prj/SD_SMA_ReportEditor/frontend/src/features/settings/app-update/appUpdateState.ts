import { ref, shallowRef } from 'vue'
import { resolveApiHref } from '@/api/apiBase.js'

export type AppUpdateCheckResult = {
  ok?: boolean
  status?: string
  currentVersion?: string
  latestVersion?: string
  message?: string
  notes?: string
  releasedAt?: string | null
}

/** 自动检查更新间隔：1 小时 */
export const APP_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export const appUpdateAvailable = ref(false)
export const appUpdateLatestVersion = ref('')
export const appUpdateNotes = ref('')
export const appUpdateDownloading = ref(false)
export const appUpdateDownloadPaused = ref(false)
export const appUpdateDownloadPercent = ref<number | null>(null)
export const appUpdateDownloadReceived = ref(0)
export const appUpdateDownloadTotal = ref(0)
export const appUpdateDownloadSpeedBps = ref<number | null>(null)
export const appUpdateDownloadStartedAt = ref<number | null>(null)
/** 下载进行中每秒 +1，驱动已用/剩余时间 UI 刷新 */
export const appUpdateProgressTick = ref(0)
export const appUpdateDownloadedReady = ref(false)
export const appUpdateCheckResult = shallowRef<AppUpdateCheckResult | null>(null)
export const appUpdateStartupPromptOpen = ref(false)

let listenersReady = false
let unsubProgress: (() => void) | null = null
let unsubCheck: (() => void) | null = null
let periodicCheckTimer: ReturnType<typeof setInterval> | null = null
let progressTickTimer: ReturnType<typeof setInterval> | null = null
let checkInFlight = false

let speedSampleReceived = 0
let speedSampleAt = 0

function applyCheckResult(res: AppUpdateCheckResult | null | undefined) {
  if (!res) return
  appUpdateCheckResult.value = res
  const available = res.status === 'available'
  appUpdateAvailable.value = available
  appUpdateLatestVersion.value = String(res.latestVersion || appUpdateLatestVersion.value || '')
  const notes = normalizeUpdateNotes(res.notes)
  appUpdateNotes.value = notes
}

function normalizeUpdateNotes(notes: unknown): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes.trim()
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const row = item as { note?: string; text?: string }
          return row.note || row.text || ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  return String(notes).trim()
}

function resetDownloadStats() {
  appUpdateDownloadReceived.value = 0
  appUpdateDownloadTotal.value = 0
  appUpdateDownloadSpeedBps.value = null
  appUpdateDownloadStartedAt.value = null
  speedSampleReceived = 0
  speedSampleAt = 0
}

function startProgressTick() {
  if (progressTickTimer != null) return
  progressTickTimer = window.setInterval(() => {
    appUpdateProgressTick.value += 1
  }, 1000)
}

function stopProgressTick() {
  if (progressTickTimer != null) {
    window.clearInterval(progressTickTimer)
    progressTickTimer = null
  }
}

function updateDownloadStats(p: {
  phase?: string
  received?: number
  total?: number
}) {
  if (typeof p.received === 'number') {
    appUpdateDownloadReceived.value = p.received
  }
  if (typeof p.total === 'number' && p.total > 0) {
    appUpdateDownloadTotal.value = p.total
  }

  const now = Date.now()
  const phase = p.phase || ''

  if (phase === 'start' || phase === 'resume') {
    appUpdateDownloadStartedAt.value = now
    speedSampleAt = now
    speedSampleReceived = typeof p.received === 'number' ? p.received : 0
    appUpdateDownloadSpeedBps.value = null
    startProgressTick()
    return
  }

  if (phase === 'progress' && typeof p.received === 'number') {
    if (!appUpdateDownloadStartedAt.value) {
      appUpdateDownloadStartedAt.value = now
      speedSampleAt = now
      speedSampleReceived = p.received
    }
    const dt = (now - speedSampleAt) / 1000
    if (dt >= 0.4) {
      const delta = p.received - speedSampleReceived
      if (delta >= 0) {
        const instant = delta / dt
        const prev = appUpdateDownloadSpeedBps.value
        appUpdateDownloadSpeedBps.value =
          prev == null ? instant : prev * 0.55 + instant * 0.45
      }
      speedSampleAt = now
      speedSampleReceived = p.received
    }
    return
  }

  if (phase === 'paused') {
    stopProgressTick()
    appUpdateDownloadSpeedBps.value = null
    return
  }

  if (phase === 'done' || phase === 'error' || phase === 'cancelled') {
    stopProgressTick()
    appUpdateDownloadSpeedBps.value = null
    if (phase === 'cancelled' || phase === 'error') {
      resetDownloadStats()
    }
  }
}

export function startPeriodicUpdateCheck() {
  stopPeriodicUpdateCheck()
  periodicCheckTimer = window.setInterval(() => {
    void runAutoUpdateCheck({ showPrompt: false })
  }, APP_UPDATE_CHECK_INTERVAL_MS)
}

export function stopPeriodicUpdateCheck() {
  if (periodicCheckTimer != null) {
    window.clearInterval(periodicCheckTimer)
    periodicCheckTimer = null
  }
}

export function initAppUpdateListeners() {
  if (listenersReady) return
  listenersReady = true
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return

  void syncAppUpdateState()
  startPeriodicUpdateCheck()

  if (api.onAppUpdateDownloadProgress) {
    unsubProgress = api.onAppUpdateDownloadProgress((p) => {
      updateDownloadStats(p)
      if (p?.phase === 'start' || p?.phase === 'progress' || p?.phase === 'resume') {
        appUpdateDownloading.value = true
        appUpdateDownloadPaused.value = false
        if (typeof p.percent === 'number') {
          appUpdateDownloadPercent.value = p.percent
        }
      } else if (p?.phase === 'paused') {
        appUpdateDownloading.value = false
        appUpdateDownloadPaused.value = true
        if (typeof p.percent === 'number') {
          appUpdateDownloadPercent.value = p.percent
        }
      } else if (p?.phase === 'cancelled') {
        appUpdateDownloading.value = false
        appUpdateDownloadPaused.value = false
        appUpdateDownloadPercent.value = null
        appUpdateDownloadedReady.value = false
      } else if (p?.phase === 'done') {
        appUpdateDownloading.value = false
        appUpdateDownloadPaused.value = false
        appUpdateDownloadPercent.value = 100
        appUpdateDownloadedReady.value = true
        if (typeof p.received === 'number') {
          appUpdateDownloadReceived.value = p.received
        }
        if (typeof p.total === 'number' && p.total > 0) {
          appUpdateDownloadTotal.value = p.total
        }
      } else if (p?.phase === 'error') {
        appUpdateDownloading.value = false
        appUpdateDownloadPaused.value = false
      }
    })
  }

  if (api.onAppUpdateCheckResult) {
    unsubCheck = api.onAppUpdateCheckResult((res) => {
      applyCheckResult(res)
    })
  }
}

export function disposeAppUpdateListeners() {
  unsubProgress?.()
  unsubCheck?.()
  unsubProgress = null
  unsubCheck = null
  stopPeriodicUpdateCheck()
  stopProgressTick()
  listenersReady = false
}

export async function syncAppUpdateState() {
  const api = window.electronAPI
  if (!api?.getAppUpdateState) return
  try {
    const s = await api.getAppUpdateState()
    applyCheckResult(s.lastCheck)
    appUpdateDownloading.value = Boolean(s.downloading)
    appUpdateDownloadPaused.value = Boolean(s.downloadPaused)
    appUpdateDownloadPercent.value =
      typeof s.downloadPercent === 'number' ? s.downloadPercent : null
    appUpdateDownloadedReady.value = Boolean(s.downloadedReady)
    if (s.lastCheck?.status === 'available') {
      appUpdateAvailable.value = true
    }
    if (s.lastCheck) {
      appUpdateLatestVersion.value = String(s.lastCheck.latestVersion || appUpdateLatestVersion.value || '')
      appUpdateNotes.value = normalizeUpdateNotes(s.lastCheck.notes)
    }
    if (s.downloading) {
      startProgressTick()
    }
  } catch {
    /* ignore */
  }
}

export async function runAutoUpdateCheck(options?: { showPrompt?: boolean }) {
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return null
  if (checkInFlight) return null
  checkInFlight = true
  const showPrompt = options?.showPrompt !== false
  try {
    const res = await api.checkAppUpdate({ silent: true })
    applyCheckResult(res)
    if (res.status === 'available' && showPrompt) {
      appUpdateStartupPromptOpen.value = true
    }
    return res
  } catch {
    return null
  } finally {
    checkInFlight = false
  }
}

export async function checkAppUpdateManual() {
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return null
  const res = await api.checkAppUpdate({ silent: false })
  applyCheckResult(res)
  await syncAppUpdateState()
  return res
}

export async function startAppUpdateDownload(options?: { fullDownload?: boolean }) {
  const api = window.electronAPI
  if (!api?.downloadAppUpdate) return null
  const resume = appUpdateDownloadPaused.value
  appUpdateDownloading.value = true
  appUpdateDownloadPaused.value = false
  if (!resume) {
    appUpdateDownloadPercent.value = 0
    resetDownloadStats()
  }
  appUpdateDownloadedReady.value = false
  const res = await api.downloadAppUpdate(options)
  await syncAppUpdateState()
  return res
}

export async function cancelAppUpdateDownload() {
  const api = window.electronAPI
  if (!api?.cancelAppUpdateDownload) return
  await api.cancelAppUpdateDownload()
  await syncAppUpdateState()
}

export async function skipAppUpdateVersion() {
  const api = window.electronAPI
  if (!api?.skipAppUpdateVersion) return null
  const res = await api.skipAppUpdateVersion()
  await syncAppUpdateState()
  return res
}

export async function clearAppUpdateSkippedVersions() {
  const api = window.electronAPI
  if (!api?.clearAppUpdateSkippedVersions) return null
  const res = await api.clearAppUpdateSkippedVersions()
  await syncAppUpdateState()
  return res
}

export async function installAppUpdate(options?: { openAfterUpgrade?: boolean }) {
  const api = window.electronAPI
  if (!api?.installAppUpdate) return null
  return api.installAppUpdate(options)
}

export async function loadAppCurrentVersion(): Promise<string> {
  const api = window.electronAPI
  if (!api?.getAppUpdateConfig) return ''
  try {
    const c = await api.getAppUpdateConfig()
    return String(c?.currentVersion || '').trim()
  } catch {
    return ''
  }
}

const LAST_RUN_VERSION_LS = 'report-editor-last-run-version'

/**
 * 启动时对比上次运行的版本号：版本变化则写一条 `update.applied` 审计。
 * 覆盖应用内升级与手动重装安装包两种途径（后者没有任何升级点击可记录）。
 * 后端首启需数秒，写入失败时保留标记下次重试，成功后才更新标记。
 */
export async function auditAppVersionChangeOnce(): Promise<void> {
  const cur = await loadAppCurrentVersion()
  if (!cur) return
  let prev = ''
  try {
    prev = localStorage.getItem(LAST_RUN_VERSION_LS) || ''
  } catch {
    return
  }
  if (prev === cur) return

  const markRecorded = () => {
    try {
      localStorage.setItem(LAST_RUN_VERSION_LS, cur)
    } catch {
      /* ignore */
    }
  }

  if (!prev) {
    // 首次运行：只记标记，不写审计
    markRecorded()
    return
  }

  const writeOnce = async (): Promise<boolean> => {
    try {
      const res = await fetch(resolveApiHref('/audit/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update.applied',
          result: 'ok',
          summary: `版本更新 ${prev} → ${cur}`,
          detail: { from: prev, to: cur },
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // 后端可能尚未就绪：最多重试约 2 分钟，成功后才更新版本标记
  for (let i = 0; i < 24; i++) {
    if (await writeOnce()) {
      markRecorded()
      return
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
}
