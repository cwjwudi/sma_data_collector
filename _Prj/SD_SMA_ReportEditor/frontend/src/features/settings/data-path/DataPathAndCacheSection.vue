<template>
  <section class="card muted-card">
    <h3>数据与路径</h3>
    <p class="muted">
      后端数据目录由运行环境决定（开发：<code>backend/data</code>；Electron：用户目录
      <code>backend-data</code>）。可通过环境变量 <code>REPORT_EDITOR_DATA_DIR</code> 覆盖。当前页面对应<strong>本机正在运行的后端实例</strong>；多窗口共享同一配置文件时，「上次连接」以最后一次切换为准。
    </p>
    <div v-if="health.data_dir" class="path-line">
      <span class="label">当前 data 目录</span>
      <code class="path">{{ health.data_dir }}</code>
    </div>
    <div v-if="healthErr" class="err">{{ healthErr }}</div>

    <h4 class="sub">数据库连接偏好</h4>
    <label class="row-check">
      <input
        :checked="prefs.auto_select_last_connection"
        type="checkbox"
        @change="onAutoSelectChange"
      />
      启动工作台时自动选中上次使用的连接（或下方指定的默认连接）
    </label>
    <div class="row-select">
      <span class="label">默认连接（可选）</span>
      <select v-model="defaultConnLocal" class="input" @change="onDefaultConnChange">
        <option value="">（不指定，仅用上次连接）</option>
        <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name || c.engine }} — {{ c.engine }}</option>
      </select>
    </div>

    <h4 class="sub">缓存与会话</h4>
    <div class="actions">
      <button type="button" class="btn sm" :disabled="busy" @click="clearQuerySessions">清空查询历史与收藏</button>
      <button type="button" class="btn sm" :disabled="busy" @click="reloadQuerySessions">重新加载查询会话</button>
      <button type="button" class="btn sm" :disabled="busy" @click="clearRelLayoutCache">清除关系浏览器布局缓存</button>
    </div>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { apiFetch } from '@/api/client.js'

const health = ref({ data_dir: '' })
const healthErr = ref('')
const prefs = ref({
  auto_select_last_connection: true,
  default_connection_id: null,
  last_connection_id: null,
})
const defaultConnLocal = ref('')
const connections = ref([])
const busy = ref(false)
const msg = ref('')

async function loadHealth() {
  healthErr.value = ''
  try {
    const h = await apiFetch('/health')
    health.value = { data_dir: h.data_dir || '' }
  } catch (e) {
    healthErr.value = e.message || String(e)
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

async function loadPrefs() {
  try {
    const p = await apiFetch('/settings/app_preferences')
    prefs.value = {
      auto_select_last_connection: p.auto_select_last_connection !== false,
      default_connection_id: p.default_connection_id || null,
      last_connection_id: p.last_connection_id || null,
    }
    defaultConnLocal.value = prefs.value.default_connection_id || ''
  } catch {
    /* ignore */
  }
}

async function savePrefs() {
  msg.value = ''
  try {
    await apiFetch('/settings/app_preferences', {
      method: 'PATCH',
      body: {
        auto_select_last_connection: prefs.value.auto_select_last_connection,
        default_connection_id: prefs.value.default_connection_id || null,
      },
    })
    msg.value = '已保存偏好。'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function onAutoSelectChange(e) {
  prefs.value.auto_select_last_connection = !!e.target.checked
  await savePrefs()
}

function onDefaultConnChange() {
  prefs.value.default_connection_id = defaultConnLocal.value || null
  savePrefs()
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
  msg.value = '已通知各页重新加载查询会话。'
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
  msg.value = `已清除 ${n} 条关系浏览器布局缓存。`
}

onMounted(async () => {
  await loadHealth()
  await loadConnections()
  await loadPrefs()
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
.muted {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.path-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}
.path {
  font-size: 12px;
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 4px;
  word-break: break-all;
}
.label {
  color: #374151;
  font-weight: 500;
}
.sub {
  font-size: 14px;
  margin: 16px 0 8px;
}
.row-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  margin-bottom: 10px;
}
.row-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
}
.input {
  min-width: 220px;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 8px;
}
.msg {
  font-size: 13px;
  color: #166534;
  margin-top: 8px;
}
</style>
