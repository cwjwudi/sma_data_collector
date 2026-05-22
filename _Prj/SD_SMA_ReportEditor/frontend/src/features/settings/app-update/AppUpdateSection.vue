<template>
  <section class="settings-section app-update">
    <h3 class="settings-section__title">软件更新</h3>
    <p class="settings-hint">
      启动时会自动检查新版本。若有更新，侧边栏「设置」会显示红点提示；也可在此手动检查、下载并安装。
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
      <div v-if="effectiveBaseUrl" class="update-meta-row">
        <dt>更新源</dt>
        <dd class="update-meta-url">{{ effectiveBaseUrl }}</dd>
      </div>
      <div v-if="lastCheckLabel" class="update-meta-row">
        <dt>上次检查</dt>
        <dd>{{ lastCheckLabel }}</dd>
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
        :disabled="busy || !isElectron || appUpdateDownloading"
        @click="checkUpdate"
      >
        {{ busy && phase === 'check' ? '正在检查…' : '检查更新' }}
      </button>
      <button
        v-if="appUpdateAvailable && !appUpdateDownloadedReady"
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy || appUpdateDownloading"
        @click="downloadUpdate"
      >
        {{ appUpdateDownloading ? `下载中 ${appUpdateDownloadPercent ?? 0}%` : '下载新版本' }}
      </button>
      <button
        v-if="appUpdateDownloading"
        type="button"
        class="settings-btn settings-btn--secondary"
        @click="pauseDownload"
      >
        暂停下载
      </button>
      <button
        v-if="appUpdateDownloadedReady"
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy"
        @click="installUpdate"
      >
        一键升级
      </button>
    </div>

    <div v-if="appUpdateDownloading" class="update-progress" aria-live="polite">
      <div class="update-progress-track">
        <div
          class="update-progress-bar"
          :class="{ indeterminate: appUpdateDownloadPercent == null }"
          :style="appUpdateDownloadPercent != null ? { width: `${appUpdateDownloadPercent}%` } : undefined"
        />
      </div>
      <p class="update-progress-hint">下载在后台进行，切换页面不会中断。</p>
    </div>

    <div v-if="showMacInstallGuide" class="update-mac-guide">
      <h4 class="update-mac-guide-title">macOS 升级步骤</h4>
      <ol class="update-mac-guide-list">
        <li>点击「一键升级」后，系统会打开已下载的 .dmg 安装镜像。</li>
        <li>将窗口中的「Report Editor」拖入「应用程序」文件夹。</li>
        <li>若提示是否替换现有版本，选择「替换」。</li>
        <li>从启动台或应用程序文件夹重新打开 Report Editor。</li>
      </ol>
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

    <div v-if="appUpdateCheckResult?.notes" class="update-notes">
      <h4 class="update-notes-title">更新说明（{{ appUpdateCheckResult.latestVersion }}）</h4>
      <pre class="update-notes-body">{{ appUpdateCheckResult.notes }}</pre>
    </div>

    <p v-if="!isElectron" class="settings-hint settings-hint--muted">
      请在桌面安装版中使用此功能。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  appUpdateAvailable,
  appUpdateCheckResult,
  appUpdateDownloadedReady,
  appUpdateDownloading,
  appUpdateDownloadPercent,
  cancelAppUpdateDownload,
  checkAppUpdateManual,
  startAppUpdateDownload,
  syncAppUpdateState,
} from './appUpdateState'

const isElectron = computed(() => Boolean(window.electronAPI?.checkAppUpdate))

const PLATFORM_LABELS: Record<string, string> = {
  'darwin-arm64': 'macOS（Apple 芯片）',
  'darwin-x64': 'macOS（Intel）',
  'win32-x64': 'Windows',
}

const config = ref({
  currentVersion: '',
  platform: '',
  baseUrl: '',
  defaultBaseUrl: '',
  skipTlsVerify: false,
  packaged: false,
  lastCheckAt: null as string | null,
  lastCheckStatus: null as string | null,
})

const baseUrlDraft = ref('')
const skipTlsDraft = ref(false)
const busy = ref(false)
const phase = ref<'idle' | 'check' | 'install'>('idle')
const msg = ref('')
const msgTone = ref<'ok' | 'warn' | 'err' | ''>('')

const platformLabel = computed(() => {
  const key = config.value.platform?.trim()
  if (!key) return ''
  return PLATFORM_LABELS[key] || key
})

const effectiveBaseUrl = computed(() => {
  const url = (config.value.baseUrl || config.value.defaultBaseUrl || '').trim()
  return url
})

const lastCheckLabel = computed(() => {
  const raw = config.value.lastCheckAt
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const status = config.value.lastCheckStatus
  const statusText =
    status === 'latest'
      ? '已是最新'
      : status === 'available'
        ? '有新版本'
        : status === 'dev'
          ? '开发模式'
          : status
            ? String(status)
            : ''
  const timeText = d.toLocaleString()
  return statusText ? `${timeText}（${statusText}）` : timeText
})

const showMacInstallGuide = computed(() => {
  const p = config.value.platform || ''
  return p.startsWith('darwin') && (appUpdateDownloadedReady.value || appUpdateAvailable.value)
})

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
    await syncAppUpdateState()
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
  }
}

async function checkUpdate() {
  busy.value = true
  phase.value = 'check'
  setMsg('')
  try {
    const res = await checkAppUpdateManual()
    if (!res) return
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
    await loadConfig()
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function downloadUpdate() {
  setMsg('正在下载安装包…')
  try {
    const res = await startAppUpdateDownload()
    if (!res) return
    if (res.cancelled) {
      setMsg('下载已暂停。', 'warn')
      return
    }
    if (!res.ok) {
      if (res.checksumError && res.expectedPrefix && res.actualPrefix) {
        setMsg(
          `${res.error}\n登记前缀：${res.expectedPrefix}…\n实际前缀：${res.actualPrefix}…`,
          'err',
        )
      } else {
        setMsg(res.error || '下载失败', 'err')
      }
      return
    }
    setMsg(`下载完成（${res.latestVersion}），可点击「一键升级」。`, 'ok')
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  }
}

async function pauseDownload() {
  await cancelAppUpdateDownload()
  setMsg('下载已暂停。', 'warn')
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
  void syncAppUpdateState().then(() => loadConfig())
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

.update-meta-url {
  word-break: break-all;
  font-weight: 400 !important;
  font-size: 13px;
}

.update-mac-guide {
  margin: 0 0 16px;
  max-width: 560px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.update-mac-guide-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.update-mac-guide-list {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 12px;
  line-height: 1.55;
  color: #475569;
}

.settings-msg {
  white-space: pre-wrap;
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

.update-progress-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
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
