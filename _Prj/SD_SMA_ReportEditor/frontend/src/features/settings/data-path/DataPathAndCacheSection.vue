<template>
  <section class="settings-section">
    <h3 class="settings-section__title">连接偏好</h3>
    <p class="settings-hint">偏好保存在配置中，多开窗口会自动一致。</p>

    <h4 class="settings-subhead">数据库</h4>
    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.auto_select_last_connection ? 'true' : 'false'"
        @click="toggleDbAuto"
      >
        <span class="settings-switch-track" :class="{ on: prefs.auto_select_last_connection }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">自动选中上次或下方默认连接</span>
      </button>
    </div>
    <div class="settings-field-row">
      <span class="settings-field-label">默认连接</span>
      <select v-model="defaultConnLocal" class="settings-select" @change="onDefaultConnChange">
        <option value="">不指定</option>
        <option v-for="c in connections" :key="c.id" :value="c.id">
          {{ c.name || c.engine }} — {{ c.engine }}
        </option>
      </select>
    </div>

    <h4 class="settings-subhead">OPC UA</h4>
    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="prefs.auto_select_last_opcua_server ? 'true' : 'false'"
        @click="toggleOpcAuto"
      >
        <span class="settings-switch-track" :class="{ on: prefs.auto_select_last_opcua_server }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">自动选中上次或下方默认服务器</span>
      </button>
    </div>
    <div class="settings-field-row">
      <span class="settings-field-label">默认服务器</span>
      <select v-model="defaultOpcLocal" class="settings-select" @change="onDefaultOpcChange">
        <option value="">不指定</option>
        <option v-for="s in opcServers" :key="s.id" :value="s.id">
          {{ s.name || s.endpoint_url }}
        </option>
      </select>
    </div>

    <h4 class="settings-subhead">用户数据目录</h4>
    <p class="settings-hint">
      数据库 / OPC UA 连接、模版、版式等保存在此目录（与程序安装位置分离）。Windows 应用内升级会保留此目录下的数据。
    </p>
    <div v-if="dataDir" class="settings-data-dir">
      <code class="settings-data-dir-path">{{ dataDir }}</code>
      <button
        v-if="canOpenDataDir"
        type="button"
        class="settings-btn settings-btn--sm"
        @click="openDataDir"
      >
        在文件管理器中打开
      </button>
    </div>
    <p v-else class="settings-hint settings-hint--muted">正在读取数据目录…</p>

    <h4 class="settings-subhead">缓存</h4>
    <div class="settings-actions">
      <button type="button" class="settings-btn" :disabled="busy" @click="clearQuerySessions">
        清空查询历史与收藏
      </button>
      <button type="button" class="settings-btn" :disabled="busy" @click="reloadQuerySessions">
        重新加载查询会话
      </button>
      <button type="button" class="settings-btn" :disabled="busy" @click="clearRelLayoutCache">
        清除关系浏览器布局
      </button>
    </div>
    <p v-if="msg" class="settings-msg">{{ msg }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/api/client.js'

const prefs = ref({
  auto_select_last_connection: true,
  default_connection_id: null,
  last_connection_id: null,
  auto_select_last_opcua_server: true,
  default_opcua_server_id: null,
  last_opcua_server_id: null,
})
const defaultConnLocal = ref('')
const defaultOpcLocal = ref('')
const connections = ref([])
const opcServers = ref([])
const busy = ref(false)
const msg = ref('')
const dataDir = ref('')

const canOpenDataDir = computed(
  () => Boolean(dataDir.value) && typeof window.electronAPI?.shellOpenPath === 'function',
)

async function loadDataDir() {
  try {
    const h = await apiFetch('/health')
    dataDir.value = String(h?.data_dir || '').trim()
  } catch {
    dataDir.value = ''
  }
}

async function openDataDir() {
  const dir = dataDir.value.trim()
  if (!dir || !window.electronAPI?.shellOpenPath) return
  try {
    const res = await window.electronAPI.shellOpenPath(dir)
    if (res && !res.ok) msg.value = res.error || '无法打开目录'
  } catch (e) {
    msg.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadConnections() {
  try {
    const data = await apiFetch('/database/connections')
    connections.value = data.connections || []
  } catch {
    connections.value = []
  }
}

async function loadOpcServers() {
  try {
    const data = await apiFetch('/opcua/servers')
    opcServers.value = data.servers || []
  } catch {
    opcServers.value = []
  }
}

async function loadPrefs() {
  try {
    const p = await apiFetch('/settings/app_preferences')
    prefs.value = {
      auto_select_last_connection: p.auto_select_last_connection !== false,
      default_connection_id: p.default_connection_id || null,
      last_connection_id: p.last_connection_id || null,
      auto_select_last_opcua_server: p.auto_select_last_opcua_server !== false,
      default_opcua_server_id: p.default_opcua_server_id || null,
      last_opcua_server_id: p.last_opcua_server_id || null,
    }
    defaultConnLocal.value = prefs.value.default_connection_id || ''
    defaultOpcLocal.value = prefs.value.default_opcua_server_id || ''
  } catch {
    /* ignore */
  }
}

async function savePrefs(patch) {
  msg.value = ''
  try {
    await apiFetch('/settings/app_preferences', {
      method: 'PATCH',
      body: patch,
    })
    msg.value = '已保存。'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function toggleDbAuto() {
  prefs.value.auto_select_last_connection = !prefs.value.auto_select_last_connection
  await savePrefs({ auto_select_last_connection: prefs.value.auto_select_last_connection })
}

async function toggleOpcAuto() {
  prefs.value.auto_select_last_opcua_server = !prefs.value.auto_select_last_opcua_server
  await savePrefs({ auto_select_last_opcua_server: prefs.value.auto_select_last_opcua_server })
}

function onDefaultConnChange() {
  prefs.value.default_connection_id = defaultConnLocal.value || null
  savePrefs({ default_connection_id: prefs.value.default_connection_id })
}

function onDefaultOpcChange() {
  prefs.value.default_opcua_server_id = defaultOpcLocal.value || null
  savePrefs({ default_opcua_server_id: prefs.value.default_opcua_server_id })
}

async function clearQuerySessions() {
  busy.value = true
  msg.value = ''
  try {
    await apiFetch('/settings/query_sessions', { method: 'DELETE' })
    window.dispatchEvent(new CustomEvent('report-editor-query-sessions-changed'))
    msg.value = '已清空查询会话。'
  } catch (e) {
    msg.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

function reloadQuerySessions() {
  window.dispatchEvent(new CustomEvent('report-editor-query-sessions-changed'))
  msg.value = '已通知重新加载查询会话。'
}

function clearRelLayoutCache() {
  let n = 0
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('relBrowserLayout:')) keys.push(k)
    }
    keys.forEach((k) => {
      localStorage.removeItem(k)
      n++
    })
  } catch {
    /* ignore */
  }
  msg.value = `已清除 ${n} 条布局缓存。`
}

onMounted(async () => {
  await Promise.all([loadConnections(), loadOpcServers(), loadPrefs(), loadDataDir()])
})
</script>

<style scoped>
.settings-data-dir {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.settings-data-dir-path {
  flex: 1 1 280px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f3f4f6;
  font-size: 12px;
  word-break: break-all;
}

.settings-btn--sm {
  padding: 6px 12px;
  font-size: 13px;
}

.settings-hint--muted {
  opacity: 0.75;
}
</style>
