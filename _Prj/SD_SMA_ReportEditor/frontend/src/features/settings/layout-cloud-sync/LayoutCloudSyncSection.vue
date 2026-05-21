<template>
  <section class="settings-section app-update">
    <h3 class="settings-section__title">版式云端同步</h3>
    <p class="settings-hint">
      将本机版式预设备份到 Portal，或从云端恢复。登录后可上传、下载；使用
      <strong>br</strong> 或 <strong>admin</strong> 账号可下载团队默认版式。
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
          <input v-model="username" type="text" class="update-input" autocomplete="username" :disabled="busy" />
        </label>
        <label class="update-field">
          <span class="update-field-label">密码</span>
          <input
            v-model="password"
            type="password"
            class="update-input"
            autocomplete="current-password"
            :disabled="busy"
          />
        </label>
        <label class="update-field">
          <span class="update-field-label">确认密码（注册时填写）</span>
          <input v-model="passwordConfirm" type="password" class="update-input" :disabled="busy" />
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
          {{ busy && phase === 'dl-default' ? '下载中…' : '下载默认版式' }}
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="downloadMine">
          {{ busy && phase === 'dl-mine' ? '下载中…' : '从云端下载我的版式' }}
        </button>
        <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="upload">
          {{ busy && phase === 'upload' ? '上传中…' : '上传版式到云端' }}
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="logout">
          退出登录
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
import { refreshLayoutPresets } from '@/lib/report-template/layout-registry'

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
const portalDraft = ref('')
const skipTlsDraft = ref(false)
const busy = ref(false)
const phase = ref<'idle' | 'login' | 'register' | 'dl-default' | 'dl-mine' | 'upload'>('idle')
const msg = ref('')
const msgTone = ref<'ok' | 'warn' | 'err' | ''>('')

function setMsg(text: string, tone: 'ok' | 'warn' | 'err' | '' = '') {
  msg.value = text
  msgTone.value = tone
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
    setMsg(e instanceof Error ? e.message : String(e), 'err')
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
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
  }
}

async function login() {
  const api = window.electronAPI
  if (!api?.layoutSyncLogin) return
  busy.value = true
  phase.value = 'login'
  setMsg('')
  try {
    const res = await api.layoutSyncLogin({
      username: username.value.trim(),
      password: password.value,
    })
    password.value = ''
    await loadConfig()
    setMsg(`已登录为 ${res.username || username.value}。`, 'ok')
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function register() {
  const api = window.electronAPI
  if (!api?.layoutSyncRegister) return
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
    setMsg(e instanceof Error ? e.message : String(e), 'err')
  } finally {
    busy.value = false
    phase.value = 'idle'
  }
}

async function importPresets(items: unknown[]) {
  if (!items.length) {
    setMsg('云端没有版式数据。', 'warn')
    return
  }
  const res = await layoutsApi.importLayoutsBulk(items as never[])
  await refreshLayoutPresets()
  setMsg(`已导入 ${res.imported ?? items.length} 条版式到本机。`, 'ok')
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
    await importPresets(res.layout_presets || [])
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
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
    await importPresets(res.layout_presets || [])
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
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
    const items = await layoutsApi.listLayoutPresetsFull()
    if (!items.length) {
      setMsg('本机没有版式可上传，请先在「版式预设」中创建。', 'warn')
      return
    }
    const res = await api.layoutSyncUpload(items)
    if (!res.ok) throw new Error(res.error || '上传失败')
    setMsg(`已上传 ${res.count ?? items.length} 条版式到云端。`, 'ok')
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err')
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

onMounted(() => {
  void loadConfig()
})
</script>

<style scoped>
.sync-form {
  max-width: 360px;
  margin-bottom: 12px;
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
