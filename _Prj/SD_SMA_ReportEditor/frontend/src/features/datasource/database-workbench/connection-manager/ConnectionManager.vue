<template>
  <div class="conn-form-pane">
    <div class="row-head">
      <h4>数据库连接</h4>
    </div>
    <template v-if="draft">
      <template v-if="isRemoteDemo">
        <p class="demo-conn-hint">
          此为<strong>远程演示</strong>连接，地址与账号由软件维护，无需填写。可直接浏览左侧数据库与表，或点击「测试连接」确认状态。
        </p>
        <dl class="demo-conn-meta">
          <div><dt>名称</dt><dd>{{ draft.name || '演示数据库（远程）' }}</dd></div>
          <div><dt>类型</dt><dd>MariaDB · 仿真</dd></div>
        </dl>
        <div class="actions">
          <button type="button" class="btn seg" :disabled="busy" @click="testOnly">测试连接</button>
          <button type="button" class="btn danger seg" v-if="draft.id" :disabled="busy" @click="remove">删除</button>
        </div>
      </template>
      <template v-else>
      <label>名称</label>
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
        <label>主机 / IP</label>
        <input v-model="draft.host" class="input" placeholder="192.168.1.10" :disabled="busy" />
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
      <template v-if="draft.engine === 'mongodb'">
        <label>authSource</label>
        <input v-model="draft.mongo_auth_source" class="input" :disabled="busy" />
      </template>
      <div class="actions">
        <button type="button" class="btn seg" :disabled="busy" @click="testOnly">测试连接</button>
        <button type="button" class="btn primary seg" :disabled="busy" @click="() => save(false)">仅保存</button>
        <button type="button" class="btn primary seg" :disabled="busy" @click="testAndSave">测试并保存</button>
        <button type="button" class="btn danger seg" v-if="draft.id" :disabled="busy" @click="remove">删除</button>
      </div>
      </template>
      <div v-if="msg" :class="['msg', msgTone]">{{ msg }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import { auditLog } from '@/lib/auditLog'
import '../../connection-form-pane.css'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['updated', 'new', 'connection-tested'])

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

const isRemoteDemo = computed(() => {
  const v = props.modelValue
  return !!(v && v.is_demo && v.demo_channel === 'remote')
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
    if (mine) emit('connection-tested', { id: mine, ok: true })
    msg.value = afterTest ? '连接成功，已写入本地配置' : '已保存'
    msgTone.value = 'ok'
    void auditLog({
      action: 'db.connection_save',
      result: 'ok',
      summary: draft.name || draft.engine || '数据库连接',
      object_type: 'db_connection',
      object_id: mine || undefined,
      detail: { engine: draft.engine, after_test: afterTest },
    })
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
    let res
    if (isRemoteDemo.value && draft.id) {
      res = await apiFetch(`/database/test_saved/${encodeURIComponent(draft.id)}`, { method: 'POST' })
    } else {
      res = await apiFetch('/database/test', {
        method: 'POST',
        body: buildApiBody(),
      })
    }
    if (res.ok) {
      if (draft.id) emit('connection-tested', { id: draft.id, ok: true })
      msg.value = isRemoteDemo.value ? '连接成功' : '连接成功（尚未保存到配置文件）'
      msgTone.value = 'ok'
    } else {
      if (draft.id) emit('connection-tested', { id: draft.id, ok: false, message: res.message || '连接失败' })
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

