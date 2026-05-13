<template>
  <section class="card muted-card">
    <h3>连接偏好</h3>
    <p class="sync-hint">偏好保存在配置中，多开窗口会自动一致。</p>

    <h4 class="sub">数据库</h4>
    <div class="row-switch">
      <button
        type="button"
        class="switch-touch"
        role="switch"
        :aria-checked="prefs.auto_select_last_connection ? 'true' : 'false'"
        @click="toggleDbAuto"
      >
        <span class="switch-track" :class="{ on: prefs.auto_select_last_connection }">
          <span class="switch-thumb" />
        </span>
        <span class="switch-label">自动选中上次或下方默认连接</span>
      </button>
    </div>
    <div class="row-select">
      <span class="field-label">默认连接</span>
      <select v-model="defaultConnLocal" class="select-touch" @change="onDefaultConnChange">
        <option value="">不指定</option>
        <option v-for="c in connections" :key="c.id" :value="c.id">
          {{ c.name || c.engine }} — {{ c.engine }}
        </option>
      </select>
    </div>

    <h4 class="sub">OPC UA</h4>
    <div class="row-switch">
      <button
        type="button"
        class="switch-touch"
        role="switch"
        :aria-checked="prefs.auto_select_last_opcua_server ? 'true' : 'false'"
        @click="toggleOpcAuto"
      >
        <span class="switch-track" :class="{ on: prefs.auto_select_last_opcua_server }">
          <span class="switch-thumb" />
        </span>
        <span class="switch-label">自动选中上次或下方默认服务器</span>
      </button>
    </div>
    <div class="row-select">
      <span class="field-label">默认服务器</span>
      <select v-model="defaultOpcLocal" class="select-touch" @change="onDefaultOpcChange">
        <option value="">不指定</option>
        <option v-for="s in opcServers" :key="s.id" :value="s.id">
          {{ s.name || s.endpoint_url }}
        </option>
      </select>
    </div>

    <h4 class="sub">缓存</h4>
    <div class="actions">
      <button type="button" class="btn-touch" :disabled="busy" @click="clearQuerySessions">
        清空查询历史与收藏
      </button>
      <button type="button" class="btn-touch" :disabled="busy" @click="reloadQuerySessions">重新加载查询会话</button>
      <button type="button" class="btn-touch" :disabled="busy" @click="clearRelLayoutCache">
        清除关系浏览器布局
      </button>
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
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
  await Promise.all([loadConnections(), loadOpcServers(), loadPrefs()])
})
</script>

<style scoped>
.muted-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  margin-top: 16px;
}
.sync-hint {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.45;
  margin-bottom: 16px;
}
.sub {
  font-size: 15px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: #111827;
}
.sub:first-of-type {
  margin-top: 0;
}
.row-switch {
  margin-bottom: 14px;
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
.row-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.field-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}
.select-touch {
  width: 100%;
  max-width: 480px;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 16px;
  background: #fff;
  cursor: pointer;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}
.btn-touch {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 18px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 16px;
  -webkit-tap-highlight-color: transparent;
}
.btn-touch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.msg {
  font-size: 14px;
  color: #166534;
  margin-top: 10px;
}
</style>
