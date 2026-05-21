<template>
  <section class="settings-section app-update">
    <h3 class="settings-section__title">软件更新</h3>
    <p class="settings-hint">
      在线检查是否有新版本。若有更新，可先下载安装包，再点击「一键升级」，按屏幕提示完成安装即可。
    </p>

    <dl class="update-meta">
      <div class="update-meta-row">
        <dt>当前版本</dt>
        <dd>{{ config.currentVersion || '—' }}</dd>
      </div>
      <div v-if="platformLabel" class="update-meta-row">
        <dt>本机系统</dt>
        <dd>{{ platformLabel }}</dd>
      </div>
    </dl>

    <details class="update-advanced">
      <summary>高级设置</summary>
      <p class="update-advanced-hint">一般无需修改。若公司内网有专用更新服务器，可由管理员填写。</p>
      <label class="update-field">
        <span class="update-field-label">更新服务器</span>
        <input
          v-model="baseUrlDraft"
          type="url"
          class="update-input"
          placeholder="由管理员提供"
          :disabled="busy"
        />
      </label>
      <label class="update-check-inline">
        <input v-model="skipTlsDraft" type="checkbox" :disabled="busy" />
        信任内网证书（一般不需要勾选）
      </label>
      <button
        type="button"
        class="settings-btn settings-btn--secondary"
        :disabled="busy"
        @click="saveConfig"
      >
        保存设置
      </button>
    </details>

    <div class="settings-actions update-actions">
      <button
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy || !isElectron"
        @click="checkUpdate"
      >
        {{ busy && phase === 'check' ? '正在检查…' : '检查更新' }}
      </button>
      <button
        v-if="checkResult?.status === 'available'"
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy || phase === 'download'"
        @click="downloadUpdate"
      >
        {{ phase === 'download' ? `下载中 ${downloadPercent ?? 0}%` : '下载新版本' }}
      </button>
      <button
        v-if="downloadedReady"
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy"
        @click="installUpdate"
      >
        一键升级
      </button>
    </div>

    <div v-if="phase === 'download'" class="update-progress" aria-live="polite">
      <div class="update-progress-track">
        <div
          class="update-progress-bar"
          :class="{ indeterminate: downloadPercent == null }"
          :style="downloadPercent != null ? { width: `${downloadPercent}%` } : undefined"
        />
      </div>
    </div>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{
        'settings-msg--ok': msgTone === 'ok',
        'settings-msg--warn': msgTone === 'warn',
        'settings-msg--err': msgTone === 'err',
      }"
    >
      {{ msg }}
    </p>

    <div v-if="checkResult?.notes" class="update-notes">
      <h4 class="update-notes-title">更新说明（{{ checkResult.latestVersion }}）</h4>
      <pre class="update-notes-body">{{ checkResult.notes }}</pre>
    </div>

    <p v-if="!isElectron" class="settings-hint settings-hint--muted">
      请在桌面安装版中使用此功能。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

type UpdateCheckResult = {
  ok?: boolean
  status?: string
  currentVersion?: string
  latestVersion?: string
  message?: string
  notes?: string
  releasedAt?: string | null
}

const isElectron = computed(() => Boolean(window.electronAPI?.checkAppUpdate))

const PLATFORM_LABELS: Record<string, string> = {
  'darwin-arm64': 'macOS（Apple 芯片）',
  'darwin-x64': 'macOS（Intel）',
  'win32-x64': 'Windows',
}

const platformLabel = computed(() => {
  const key = config.value.platform?.trim()
  if (!key) return ''
  return PLATFORM_LABELS[key] || key
})

const config = ref({
  currentVersion: '',
  platform: '',
  baseUrl: '',
  defaultBaseUrl: '',
  skipTlsVerify: false,
  packaged: false,
})

const baseUrlDraft = ref('')
const skipTlsDraft = ref(false)
const busy = ref(false)
const phase = ref<'idle' | 'check' | 'download' | 'install'>('idle')
const msg = ref('')
const msgTone = ref<'ok' | 'warn' | 'err' | ''>('')
const checkResult = ref<UpdateCheckResult | null>(null)
const downloadPercent = ref<number | null>(null)
const downloadedReady = ref(false)

let unsubProgress: (() => void) | null = null

function setMsg(text: string, tone: 'ok' | 'warn' | 'err' | '' = '') {
  msg.value = text
  msgTone.value = tone
}

async function loadConfig() {
  const api = window.electronAPI
  if (!api?.getAppUpdateConfig) return
  try {
    const c = await api.getAppUpdateConfig()
    config.value = c
    baseUrlDraft.value = c.baseUrl || ''
    skipTlsDraft.value = Boolean(c.skipTlsVerify)
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  }
}

async function saveConfig() {
  const api = window.electronAPI
  if (!api?.setAppUpdateConfig) return
  busy.value = true
  setMsg('')
  try {
    config.value = await api.setAppUpdateConfig({
      baseUrl: baseUrlDraft.value,
      skipTlsVerify: skipTlsDraft.value,
    })
    setMsg('设置已保存。', 'ok')
    checkResult.value = null
    downloadedReady.value = false
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
  }
}

async function checkUpdate() {
  const api = window.electronAPI
  if (!api?.checkAppUpdate) return
  busy.value = true
  phase.value = 'check'
  setMsg('')
  checkResult.value = null
  downloadedReady.value = false
  downloadPercent.value = null
  try {
    const res = await api.checkAppUpdate()
    checkResult.value = res
    if (res.status === 'latest') {
      setMsg(res.message || '当前已是最新版本。', 'ok')
    } else if (res.status === 'available') {
      setMsg(`发现新版本 ${res.latestVersion}，可点击下方下载。`, 'ok')
    } else if (res.status === 'dev') {
      setMsg('当前为开发模式，无法在线升级。', 'warn')
    } else if (res.ok === false) {
      setMsg(res.message || '检查更新失败。', 'err')
    } else {
      setMsg(res.message || '检查完成。', 'ok')
    }
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function downloadUpdate() {
  const api = window.electronAPI
  if (!api?.downloadAppUpdate) return
  busy.value = true
  phase.value = 'download'
  downloadPercent.value = 0
  setMsg('正在下载安装包…')
  try {
    const res = await api.downloadAppUpdate()
    if (!res.ok) {
      setMsg(res.error || '下载失败', 'err')
      downloadedReady.value = false
      return
    }
    downloadedReady.value = true
    downloadPercent.value = 100
    setMsg(`下载完成（${res.latestVersion}），可点击「一键升级」。`, 'ok')
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function installUpdate() {
  const api = window.electronAPI
  if (!api?.installAppUpdate) return
  if (!window.confirm('即将退出本软件并启动升级流程，未保存的编辑请先保存。是否继续？')) {
    return
  }
  busy.value = true
  phase.value = 'install'
  try {
    const res = await api.installAppUpdate()
    if (!res.ok) {
      setMsg(res.error || '启动升级失败', 'err')
      return
    }
    setMsg(res.message || '已启动升级。', 'ok')
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

onMounted(() => {
  void loadConfig()
  const api = window.electronAPI
  if (api?.onAppUpdateDownloadProgress) {
    unsubProgress = api.onAppUpdateDownloadProgress((p) => {
      if (p?.phase === 'progress' && typeof p.percent === 'number') {
        downloadPercent.value = p.percent
      }
    })
  }
})

onUnmounted(() => {
  unsubProgress?.()
})
</script>

<style scoped>
.update-meta {
  margin: 0 0 16px;
  display: grid;
  gap: 6px;
  max-width: 480px;
}

.update-meta-row {
  display: flex;
  gap: 12px;
  font-size: 14px;
}

.update-meta-row dt {
  margin: 0;
  min-width: 72px;
  color: #6b7280;
}

.update-meta-row dd {
  margin: 0;
  color: #111827;
  font-weight: 500;
}

.update-advanced {
  margin-bottom: 16px;
  max-width: 560px;
  font-size: 13px;
  color: #374151;
}

.update-advanced summary {
  cursor: pointer;
  margin-bottom: 10px;
  color: #4b5563;
}

.update-advanced-hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.update-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.update-field-label {
  font-size: 12px;
  color: #6b7280;
}

.update-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
}

.update-check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
}

.update-actions {
  flex-wrap: wrap;
}

.update-progress {
  max-width: 480px;
  margin: 10px 0 0;
}

.update-progress-track {
  height: 6px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.update-progress-bar {
  height: 100%;
  background: #6366f1;
  border-radius: 999px;
  transition: width 0.2s ease;
}

.update-progress-bar.indeterminate {
  width: 40% !important;
  animation: update-indeterminate 1.2s ease-in-out infinite;
}

@keyframes update-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.update-notes {
  margin-top: 16px;
  max-width: 560px;
}

.update-notes-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.update-notes-body {
  margin: 0;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #374151;
}

.settings-hint--muted {
  margin-top: 12px;
  color: #9ca3af;
}

.settings-btn--secondary {
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
}
</style>
