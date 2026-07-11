<template>
  <section class="settings-section app-update">
    <h3 class="settings-section__title">云端同步（Portal）</h3>
    <p class="settings-hint">
      登录后可：① 上传/下载<strong>我的模版与版式</strong>（仅设计内容，不含数据库/OPC/AI 等配置）；②
      <strong>整机配置云备份</strong>（与「备份与恢复」相同的完整软件状态，换机一键恢复）；③ 下载<strong>团队模版与版式</strong>
      （由团队发版时更新的快照，内容可能滞后于个人最新修改）。
    </p>

    <dl v-if="config.loggedIn" class="update-meta">
      <div class="update-meta-row">
        <dt>已登录</dt>
        <dd>{{ config.username }}</dd>
      </div>
    </dl>

    <template v-if="!config.loggedIn">
      <div class="sync-form">
        <label class="update-field">
          <span class="update-field-label">用户名</span>
          <input
            ref="usernameInputRef"
            v-model="username"
            type="text"
            class="update-input"
            name="username"
            autocomplete="username"
            :disabled="busy"
          />
        </label>
        <label class="update-field">
          <span class="update-field-label">密码</span>
          <input
            ref="passwordInputRef"
            v-model="password"
            type="password"
            class="update-input"
            name="password"
            autocomplete="current-password"
            :disabled="busy"
            @keydown.enter.prevent="login"
          />
        </label>
        <label class="update-field">
          <span class="update-field-label">确认密码（注册时填写）</span>
          <input
            v-model="passwordConfirm"
            type="password"
            class="update-input"
            name="password-confirm"
            autocomplete="new-password"
            :disabled="busy"
          />
        </label>
      </div>
      <div class="settings-actions update-actions">
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || !isElectron" @click="login">
          {{ busy && phase === 'login' ? '登录中…' : '登录' }}
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy || !isElectron" @click="register">
          {{ busy && phase === 'register' ? '注册中…' : '注册新账号' }}
        </button>
      </div>
      <details class="update-advanced">
        <summary>注册说明</summary>
        <p class="update-advanced-hint">
          点击「注册新账号」前请填写确认密码。用户名 3–32 位（字母、数字、下划线），密码至少 6 位。
        </p>
      </details>
    </template>

    <template v-else>
      <div class="settings-actions update-actions">
        <button
          type="button"
          class="settings-btn settings-btn--primary"
          :disabled="busy"
          @click="downloadDefaults"
        >
          {{ busy && phase === 'dl-default' ? '下载中…' : '下载团队模版与版式' }}
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="downloadMine">
          {{ busy && phase === 'dl-mine' ? '下载中…' : '从云端下载我的模版与版式' }}
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="upload">
          {{ busy && phase === 'upload' ? '上传中…' : '上传模版与版式到云端' }}
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="logout">
          退出登录
        </button>
      </div>

      <h4 class="sync-sub-title">整机配置云备份</h4>
      <p class="settings-hint">
        与「备份与恢复」同等完整范围：数据库、OPC UA、模版、版式、签名、AI 设置、查询收藏、生成报表与界面偏好等整体打包（加密，云端不可读），
        可在另一台电脑登录同一账号后一键恢复。注意：上方「模版与版式」同步<strong>不包含</strong>数据源与 OPC。
      </p>
      <div class="settings-actions update-actions">
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="uploadFullConfig">
          {{ busy && phase === 'upload-config' ? '上传中…' : '上传整机配置备份' }}
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="confirmRestoreFullConfig">
          {{ busy && phase === 'dl-config' ? '恢复中…' : '从云端恢复整机配置' }}
        </button>
      </div>
    </template>

    <details class="update-advanced">
      <summary>高级设置</summary>
      <p class="update-advanced-hint">一般无需修改。内网部署时可填写 Portal 地址。</p>
      <label class="update-field">
        <span class="update-field-label">Portal 地址</span>
        <input v-model="portalDraft" type="url" class="update-input" placeholder="https://brportal.cpolar.top" :disabled="busy" />
      </label>
      <label class="update-check-inline">
        <input v-model="skipTlsDraft" type="checkbox" :disabled="busy" />
        信任内网证书（一般不需要勾选）
      </label>
      <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="savePortal">
        保存设置
      </button>
    </details>

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

    <p v-if="!isElectron" class="settings-hint settings-hint--muted">请在桌面安装版中使用此功能。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import * as layoutsApi from '@/api/layoutPresets'
import * as templatesApi from '@/api/templates'
import { resolveApiHref } from '@/api/apiBase.js'
import { refreshLayoutPresets, clearLayoutCache } from '@/lib/report-template/layout-registry'
import {
  collectClientPrefsFull,
  finalizeConfigRestore,
  formatBackupCountSummary,
  formatImportStatsSummary,
  notifyReportEditorConfigRestored,
  type ImportStats,
} from '@/features/settings/config-import-export/config-bundle-client'
import { clearTemplateViewCache } from '@/lib/report-template/template-view-cache'

const isElectron = computed(() => Boolean(window.electronAPI?.layoutSyncLogin))

const config = ref({
  portalBaseUrl: '',
  defaultPortalBaseUrl: '',
  username: '',
  loggedIn: false,
  skipTlsVerify: false,
})

const username = ref('')
const password = ref('')
const passwordConfirm = ref('')
const usernameInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)
const portalDraft = ref('')
const skipTlsDraft = ref(false)
const busy = ref(false)
const phase = ref<'idle' | 'login' | 'register' | 'dl-default' | 'dl-mine' | 'upload' | 'upload-config' | 'dl-config'>('idle')
const msg = ref('')
const msgTone = ref<'ok' | 'warn' | 'err' | ''>('')

function setMsg(text: string, tone: 'ok' | 'warn' | 'err' | '' = '') {
  msg.value = text
  msgTone.value = tone
}

/** Electron IPC 错误常带 “Error invoking remote method …”，截成可读中文 */
function formatSyncError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e || '')
  const m = raw.match(/Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/i)
  const core = (m?.[1] || raw).trim()
  return core || '操作失败'
}

/** 密码管理器自动填充时，偶发视觉已填但 v-model 仍空：提交前从 DOM 回读 */
function syncCredsFromDom() {
  const uEl = usernameInputRef.value
  const pEl = passwordInputRef.value
  if (uEl && typeof uEl.value === 'string' && uEl.value.trim() && !username.value.trim()) {
    username.value = uEl.value
  }
  if (pEl && typeof pEl.value === 'string' && pEl.value && !password.value) {
    password.value = pEl.value
  }
}

async function loadConfig() {
  const api = window.electronAPI
  if (!api?.getLayoutSyncConfig) return
  try {
    config.value = await api.getLayoutSyncConfig()
    portalDraft.value = config.value.portalBaseUrl || config.value.defaultPortalBaseUrl || ''
    skipTlsDraft.value = Boolean(config.value.skipTlsVerify)
    if (config.value.loggedIn && config.value.username) {
      username.value = config.value.username
    }
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  }
}

async function savePortal() {
  const api = window.electronAPI
  if (!api?.setLayoutSyncConfig) return
  busy.value = true
  setMsg('')
  try {
    config.value = await api.setLayoutSyncConfig({
      portalBaseUrl: portalDraft.value,
      skipTlsVerify: skipTlsDraft.value,
    })
    setMsg('设置已保存。', 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
  }
}

async function login() {
  const api = window.electronAPI
  if (!api?.layoutSyncLogin) return
  syncCredsFromDom()
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) {
    setMsg('请先填写用户名和密码后再登录。', 'warn')
    return
  }
  busy.value = true
  phase.value = 'login'
  setMsg('')
  try {
    const res = await api.layoutSyncLogin({
      username: u,
      password: p,
    })
    password.value = ''
    await loadConfig()
    setMsg(`已登录为 ${res.username || u}。`, 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function register() {
  const api = window.electronAPI
  if (!api?.layoutSyncRegister) return
  syncCredsFromDom()
  if (!username.value.trim() || !password.value) {
    setMsg('注册前请填写用户名和密码。', 'warn')
    return
  }
  if (!passwordConfirm.value) {
    setMsg('注册时请填写确认密码。', 'warn')
    return
  }
  busy.value = true
  phase.value = 'register'
  setMsg('')
  try {
    const res = await api.layoutSyncRegister({
      username: username.value.trim(),
      password: password.value,
      passwordConfirm: passwordConfirm.value || password.value,
    })
    password.value = ''
    passwordConfirm.value = ''
    await loadConfig()
    setMsg(`注册并登录成功：${res.username || username.value}。`, 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function importCloudAssets(layoutPresets: unknown[], templates: unknown[]) {
  const layoutItems = Array.isArray(layoutPresets) ? layoutPresets : []
  const templateItems = Array.isArray(templates) ? templates : []
  if (!layoutItems.length && !templateItems.length) {
    setMsg('云端没有模版或版式数据。', 'warn')
    return
  }
  let layoutImported = 0
  let templateImported = 0
  if (layoutItems.length) {
    const res = await layoutsApi.importLayoutsBulk(layoutItems as never[])
    layoutImported = res.imported ?? layoutItems.length
    clearLayoutCache()
    await refreshLayoutPresets()
  }
  if (templateItems.length) {
    const res = await templatesApi.importTemplatesBulk(templateItems as never[])
    templateImported = res.imported ?? templateItems.length
    clearTemplateViewCache()
  }
  notifyReportEditorConfigRestored()
  const parts: string[] = []
  if (templateImported) parts.push(`${templateImported} 条模版`)
  if (layoutImported) parts.push(`${layoutImported} 条版式`)
  setMsg(`已导入 ${parts.join('、')} 到本机。`, 'ok')
}

async function downloadDefaults() {
  const api = window.electronAPI
  if (!api?.layoutSyncDownloadDefaults) return
  busy.value = true
  phase.value = 'dl-default'
  setMsg('')
  try {
    const res = await api.layoutSyncDownloadDefaults()
    if (!res.ok) throw new Error(res.error || '下载失败')
    await importCloudAssets(res.layout_presets || [], res.templates || [])
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function downloadMine() {
  const api = window.electronAPI
  if (!api?.layoutSyncDownloadMine) return
  busy.value = true
  phase.value = 'dl-mine'
  setMsg('')
  try {
    const res = await api.layoutSyncDownloadMine()
    if (!res.ok) throw new Error(res.error || '下载失败')
    await importCloudAssets(res.layout_presets || [], res.templates || [])
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function upload() {
  const api = window.electronAPI
  if (!api?.layoutSyncUpload) return
  busy.value = true
  phase.value = 'upload'
  setMsg('')
  try {
    const [layoutPresets, templates] = await Promise.all([
      layoutsApi.listLayoutPresetsFull(),
      templatesApi.listTemplatesFull(),
    ])
    if (!layoutPresets.length && !templates.length) {
      setMsg('本机没有模版或版式可上传，请先在「模版管理」或「版式预设」中创建。', 'warn')
      return
    }
    const res = await api.layoutSyncUpload({ layoutPresets, templates })
    if (!res.ok) throw new Error(res.error || '上传失败')
    const parts: string[] = []
    if (res.templateCount) parts.push(`${res.templateCount} 条模版`)
    if (res.layoutCount) parts.push(`${res.layoutCount} 条版式`)
    setMsg(`已上传 ${parts.join('、')} 到云端。`, 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function logout() {
  const api = window.electronAPI
  if (!api?.setLayoutSyncConfig) return
  await api.setLayoutSyncConfig({ logout: true })
  password.value = ''
  await loadConfig()
  setMsg('已退出登录。', 'ok')
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 与「备份与恢复」相同完整范围：后端导出加密 .rebak，整体上传到 Portal */
async function uploadFullConfig() {
  const api = window.electronAPI
  if (!api?.layoutSyncUploadConfig) {
    setMsg('当前版本不支持整机配置云备份，请升级桌面版。', 'warn')
    return
  }
  busy.value = true
  phase.value = 'upload-config'
  setMsg('')
  try {
    const clientPrefs = await collectClientPrefsFull()
    const res = await fetch(resolveApiHref('/settings/config/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'backup', format: 'encrypted', client_prefs: clientPrefs }),
    })
    if (!res.ok) throw new Error(`导出本机配置失败（HTTP ${res.status}）`)
    const summary = formatBackupCountSummary(res.headers)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const up = await api.layoutSyncUploadConfig({ bundleBase64: bytesToBase64(bytes) })
    if (!up.ok) throw new Error(up.error || '上传失败')
    const kb = Math.max(1, Math.round(bytes.length / 1024))
    setMsg(`完整软件状态已上传到云端（约 ${kb} KB）：${summary}。`, 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

function confirmRestoreFullConfig() {
  if (
    !window.confirm(
      '「从云端恢复整机配置」将用云端备份完全替换本机现有的连接（含 OPC UA）、模版、版式、签名、AI 与生成报表等设置。\n\n建议先在「备份与恢复」中导出一份当前备份再操作。\n\n确定要继续吗？',
    )
  ) {
    return
  }
  void restoreFullConfig()
}

async function restoreFullConfig() {
  const api = window.electronAPI
  if (!api?.layoutSyncDownloadConfig) {
    setMsg('当前版本不支持整机配置云备份，请升级桌面版。', 'warn')
    return
  }
  busy.value = true
  phase.value = 'dl-config'
  setMsg('')
  try {
    const dl = await api.layoutSyncDownloadConfig()
    if (!dl.ok || !dl.bundleBase64) throw new Error(dl.error || '云端下载失败')
    const bytes = base64ToBytes(dl.bundleBase64)
    const res = await fetch(resolveApiHref('/settings/config/import?mode=replace'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    const text = await res.text()
    let data: {
      ok?: boolean
      client_prefs?: unknown
      imported?: ImportStats
      warnings?: string[]
      detail?: unknown
    } | null = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      throw new Error(data?.detail ? String(data.detail) : text || `恢复失败（HTTP ${res.status}）`)
    }
    const clientApplied = await finalizeConfigRestore({ clientPrefs: data?.client_prefs })
    const parts = formatImportStatsSummary(data?.imported)
    if (clientApplied.length) parts.push('本机设置已更新')
    const detail = parts.length ? `已恢复：${parts.join('、')}。` : '恢复完成。'
    const warnLines = Array.isArray(data?.warnings)
      ? data.warnings.filter((w) => typeof w === 'string' && w)
      : []
    const warnText = warnLines.length ? `\n${warnLines.join('\n')}` : ''
    const stamp = dl.updatedAt ? `（云端备份时间：${new Date(dl.updatedAt).toLocaleString()}）` : ''
    setMsg(`已用云端备份恢复完整软件状态${stamp}。${detail}${warnText}\n切换页面即可查看，无需重启。`, warnLines.length ? 'warn' : 'ok')
  } catch (e) {
    setMsg(formatSyncError(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<style scoped>
.sync-form {
  max-width: 360px;
  margin-bottom: 12px;
}

.sync-sub-title {
  margin: 18px 0 6px;
  font-size: 14px;
  color: #111827;
}

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
  margin: 16px 0;
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
