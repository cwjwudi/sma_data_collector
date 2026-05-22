import { ref, shallowRef } from 'vue'

export type AppUpdateCheckResult = {
  ok?: boolean
  status?: string
  currentVersion?: string
  latestVersion?: string
  message?: string
  notes?: string
  releasedAt?: string | null
}

export const appUpdateAvailable = ref(false)
export const appUpdateLatestVersion = ref('')
export const appUpdateNotes = ref('')
export const appUpdateDownloading = ref(false)
export const appUpdateDownloadPaused = ref(false)
export const appUpdateDownloadPercent = ref<number | null>(null)
export const appUpdateDownloadedReady = ref(false)
export const appUpdateCheckResult = shallowRef<AppUpdateCheckResult | null>(null)
export const appUpdateStartupPromptOpen = ref(false)

let listenersReady = false
let unsubProgress: (() => void) | null = null
let unsubCheck: (() => void) | null = null

function applyCheckResult(res: AppUpdateCheckResult | null | undefined) {
  if (!res) return
  appUpdateCheckResult.value = res
  const available = res.status === 'available'
  appUpdateAvailable.value = available
  appUpdateLatestVersion.value = available ? String(res.latestVersion || '') : ''
  appUpdateNotes.value = available ? String(res.notes || '') : ''
}

export function initAppUpdateListeners() {
  if (listenersReady) return
  listenersReady = true
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return

  void syncAppUpdateState()

  if (api.onAppUpdateDownloadProgress) {
    unsubProgress = api.onAppUpdateDownloadProgress((p) => {
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
      appUpdateLatestVersion.value = String(s.lastCheck.latestVersion || '')
      appUpdateNotes.value = String(s.lastCheck.notes || '')
    }
  } catch {
    /* ignore */
  }
}

export async function runAutoUpdateCheck() {
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return null
  try {
    const res = await api.checkAppUpdate({ silent: true })
    applyCheckResult(res)
    if (res.status === 'available') {
      appUpdateStartupPromptOpen.value = true
    }
    return res
  } catch {
    return null
  }
}

export async function checkAppUpdateManual() {
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return null
  const res = await api.checkAppUpdate({ silent: false })
  applyCheckResult(res)
  return res
}

export async function startAppUpdateDownload() {
  const api = window.electronAPI
  if (!api?.downloadAppUpdate) return null
  const resume = appUpdateDownloadPaused.value
  appUpdateDownloading.value = true
  appUpdateDownloadPaused.value = false
  if (!resume) {
    appUpdateDownloadPercent.value = 0
  }
  appUpdateDownloadedReady.value = false
  const res = await api.downloadAppUpdate()
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
