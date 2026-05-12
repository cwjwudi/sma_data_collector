<template>
  <div class="cm">
    <div class="row-head">
      <h4>数据库连接</h4>
      <button type="button" class="btn sm" :disabled="busy" @click="$emit('new')">新建</button>
    </div>
    <ul class="conn-list">
      <li
        v-for="c in connections"
        :key="c.id"
        :class="{ active: c.id === activeId }"
        @click="$emit('select', c)"
      >
        <span class="name">{{ c.name || c.engine }}</span>
        <span class="badge">{{ c.engine }}</span>
      </li>
    </ul>
    <div v-if="draft" class="form">
      <label>显示名称</label>
      <input v-model="draft.name" class="input" placeholder="例如 产线 MySQL" />
      <label>引擎</label>
      <select v-model="draft.engine" class="input" :disabled="busy">
        <option value="mysql">MySQL</option>
        <option value="mariadb">MariaDB</option>
        <option value="postgres">PostgreSQL</option>
        <option value="sqlite">SQLite</option>
        <option value="mongodb">MongoDB</option>
      </select>
      <template v-if="draft.engine !== 'sqlite'">
        <label>主机</label>
        <input v-model="draft.host" class="input" placeholder="IP 或主机名" :disabled="busy" />
        <label>端口</label>
        <input v-model="draft.portText" type="text" inputmode="numeric" class="input" placeholder="留空则使用默认端口" :disabled="busy" />
        <label>用户名</label>
        <input v-model="draft.username" class="input" autocomplete="username" :disabled="busy" />
        <label>密码</label>
        <input
          v-model="draft.password"
          type="password"
          class="input"
          autocomplete="current-password"
          :placeholder="draft.id && hasSavedPassword ? '留空表示沿用已保存密码' : '可选'"
          :disabled="busy"
        />
      </template>
      <template v-if="draft.engine === 'sqlite'">
        <label>SQLite 路径（后端所在机器上的路径）</label>
        <input v-model="draft.sqlite_path" class="input" placeholder="D:\\data\\app.db" :disabled="busy" />
      </template>
      <template v-if="draft.engine !== 'sqlite' && draft.engine !== 'mongodb'">
        <label>默认数据库（可选）</label>
        <input v-model="draft.database" class="input" placeholder="连接后可再选库" :disabled="busy" />
      </template>
      <template v-if="draft.engine === 'mongodb'">
        <label>默认数据库（可选）</label>
        <input v-model="draft.database" class="input" :disabled="busy" />
        <label>authSource</label>
        <input v-model="draft.mongo_auth_source" class="input" :disabled="busy" />
      </template>
      <div class="actions">
        <button type="button" class="btn sm" :disabled="busy" @click="testOnly">测试连接</button>
        <button type="button" class="btn primary sm" :disabled="busy" @click="() => save(false)">仅保存</button>
        <button type="button" class="btn primary sm" :disabled="busy" @click="testAndSave">测试并保存</button>
        <button type="button" class="btn danger sm" v-if="draft.id" :disabled="busy" @click="remove">删除</button>
      </div>
      <p class="hint">
        配置写入本机 data/config.json；密码经本机密钥加密。若曾复制过 config 但未复制同目录下的
        .report_editor_fernet.key，请重新输入密码再保存。
      </p>
      <div v-if="msg" :class="['msg', msgTone]">{{ msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps({
  connections: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['select', 'updated', 'new'])

const draft = reactive({
  id: '',
  name: '',
  engine: 'mysql',
  host: '127.0.0.1',
  portText: '3306',
  database: '',
  username: '',
  password: '',
  sqlite_path: '',
  mongo_auth_source: 'admin',
})

const msg = ref('')
const msgTone = ref('')
const busy = ref(false)

const hasSavedPassword = computed(() => {
  const v = props.modelValue
  return !!(v && v.has_password)
})

function defaultPortForEngine(engine) {
  if (engine === 'postgres') return 5432
  if (engine === 'mongodb') return 27017
  return 3306
}

function effectivePort() {
  const raw = String(draft.portText ?? '').trim()
  if (!raw) return defaultPortForEngine(draft.engine)
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return defaultPortForEngine(draft.engine)
  }
  return n
}

watch(
  () => props.modelValue,
  (v) => {
    msg.value = ''
    msgTone.value = ''
    if (!v) {
      draft.id = ''
      draft.name = ''
      draft.engine = 'mysql'
      draft.host = '127.0.0.1'
      draft.portText = String(defaultPortForEngine('mysql'))
      draft.database = ''
      draft.username = ''
      draft.password = ''
      draft.sqlite_path = ''
      draft.mongo_auth_source = 'admin'
      return
    }
    const eng = v.engine || 'mysql'
    const dp = defaultPortForEngine(eng)
    const p = v.port != null && v.port !== '' ? String(v.port) : String(dp)
    Object.assign(draft, {
      id: v.id || '',
      name: v.name || '',
      engine: eng,
      host: v.host || '127.0.0.1',
      portText: p,
      database: v.database || '',
      username: v.username || '',
      password: '',
      sqlite_path: v.sqlite_path || '',
      mongo_auth_source: v.mongo_auth_source || 'admin',
    })
  },
  { immediate: true },
)

watch(
  () => draft.engine,
  (eng, prev) => {
    if (!prev || eng === prev) return
    const cur = String(draft.portText ?? '').trim()
    const prevDefault = String(defaultPortForEngine(prev))
    if (!cur || cur === prevDefault) {
      draft.portText = String(defaultPortForEngine(eng))
    }
  },
)

function buildApiBody() {
  const engine = draft.engine
  const port = effectivePort()
  const common = {
    id: draft.id || null,
    name: (draft.name || '').trim(),
    engine,
    database: (draft.database || '').trim() || null,
    mongo_auth_source: (draft.mongo_auth_source || 'admin').trim() || 'admin',
  }
  if (engine === 'sqlite') {
    return {
      ...common,
      host: null,
      port: null,
      username: null,
      password: draft.password ? draft.password : null,
      sqlite_path: (draft.sqlite_path || '').trim() || null,
    }
  }
  return {
    ...common,
    host: (draft.host || '').trim() || '127.0.0.1',
    port,
    username: (draft.username || '').trim() || null,
    password: draft.password ? draft.password : null,
    sqlite_path: null,
  }
}

async function save(afterTest = false) {
  msg.value = ''
  msgTone.value = ''
  busy.value = true
  try {
    const data = await apiFetch('/database/connections', {
      method: 'POST',
      body: buildApiBody(),
    })
    const list = data.connections || []
    const sid = data.saved_id
    const mine =
      sid ||
      list.find((x) => x.name === draft.name && x.engine === draft.engine)?.id ||
      list[list.length - 1]?.id ||
      null
    emit('updated', mine)
    msg.value = afterTest ? '连接成功，已写入本地配置' : '已保存'
    msgTone.value = 'ok'
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

async function runTest() {
  busy.value = true
  try {
    const res = await apiFetch('/database/test', {
      method: 'POST',
      body: buildApiBody(),
    })
    return { ok: !!res.ok, message: res.message || '' }
  } catch (e) {
    return { ok: false, message: e.message || String(e) }
  } finally {
    busy.value = false
  }
}

async function testOnly() {
  msg.value = ''
  msgTone.value = ''
  busy.value = true
  try {
    const res = await apiFetch('/database/test', {
      method: 'POST',
      body: buildApiBody(),
    })
    if (res.ok) {
      msg.value = '连接成功（尚未保存到配置文件）'
      msgTone.value = 'ok'
    } else {
      msg.value = res.message || '连接失败'
      msgTone.value = 'err'
    }
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

async function testAndSave() {
  msg.value = ''
  msgTone.value = ''
  const t = await runTest()
  if (!t.ok) {
    msg.value = t.message || '连接失败'
    msgTone.value = 'err'
    return
  }
  await save(true)
}

async function remove() {
  if (!draft.id) return
  busy.value = true
  try {
    await apiFetch(`/database/connections/${draft.id}`, { method: 'DELETE' })
    emit('updated', null)
    emit('new')
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.cm {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
  min-width: 260px;
}
.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.conn-list {
  list-style: none;
  padding: 0;
  margin: 8px 0;
}
.conn-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.conn-list li.active {
  background: #eef2ff;
}
.badge {
  font-size: 11px;
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
}
.form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  padding: 8px 12px;
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
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn.danger {
  color: #b91c1c;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.msg {
  font-size: 12px;
  line-height: 1.45;
}
.msg.ok {
  color: #047857;
}
.msg.err {
  color: #b91c1c;
}
.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #6b7280;
}
label {
  font-size: 12px;
  color: #4b5563;
}
</style>
