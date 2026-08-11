<template>
  <div class="conn-form-pane">
    <div class="row-head">
      <h4>数据库连接</h4>
    </div>
    <p v-if="loading" class="conn-placeholder">{{ loadingMessage }}</p>
    <template v-else-if="modelValue || creatingNew">
      <template v-if="isRemoteDemo">
        <div class="conn-form-pane__body">
          <p class="demo-conn-hint">
            此为<strong>远程演示</strong>连接，地址与账号由软件维护，无需填写。可直接浏览左侧数据库与表，或点击「测试连接」确认状态。
          </p>
          <dl class="demo-conn-meta">
            <div><dt>名称</dt><dd>{{ draft.name || '演示数据库（远程）' }}</dd></div>
            <div><dt>类型</dt><dd>MariaDB · 仿真</dd></div>
          </dl>
        </div>
        <div class="conn-form-pane__actions actions">
          <button type="button" class="btn seg" :disabled="busy" @click="testOnly">测试连接</button>
          <button type="button" class="btn danger seg" v-if="draft.id" :disabled="formDisabled" @click="remove">删除</button>
        </div>
      </template>
      <template v-else>
        <div class="conn-form-pane__body">
          <p v-if="locked" class="demo-conn-hint">数据源已锁定，仅可查看与测试连接。</p>
          <label>名称</label>
          <input v-model="draft.name" class="input" placeholder="例如 产线 MySQL" :disabled="formDisabled" />
          <label>引擎</label>
          <select v-model="draft.engine" class="input" :disabled="formDisabled">
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="postgres">PostgreSQL</option>
            <option value="sqlite">SQLite</option>
            <option value="mongodb">MongoDB</option>
          </select>
          <template v-if="draft.engine !== 'sqlite'">
            <label>主机 / IP</label>
            <input v-model="draft.host" class="input" placeholder="192.168.1.10" :disabled="formDisabled" />
            <label>端口</label>
            <input
              v-model="draft.portText"
              type="text"
              inputmode="numeric"
              class="input"
              placeholder="留空则使用默认端口"
              :disabled="formDisabled"
            />
            <label>{{ draft.engine === 'mongodb' ? '默认数据库（可选）' : '数据库（可选）' }}</label>
            <input
              v-model="draft.database"
              class="input"
              placeholder="留空则打开后自动选择可用库"
              :disabled="formDisabled"
            />
            <label>用户名</label>
            <input v-model="draft.username" class="input" autocomplete="username" :disabled="formDisabled" />
            <label>密码</label>
            <input
              v-model="draft.password"
              type="password"
              class="input"
              autocomplete="current-password"
              :placeholder="draft.id && hasSavedPassword ? '留空表示沿用已保存密码' : '可选'"
              :disabled="formDisabled"
            />
          </template>
          <template v-if="draft.engine === 'sqlite'">
            <label>SQLite 路径（后端所在机器上的路径）</label>
            <input v-model="draft.sqlite_path" class="input" placeholder="D:\\data\\app.db" :disabled="formDisabled" />
          </template>
          <template v-if="draft.engine === 'mongodb'">
            <label>authSource</label>
            <input v-model="draft.mongo_auth_source" class="input" :disabled="formDisabled" />
          </template>
        </div>
        <div class="conn-form-pane__actions actions">
          <button type="button" class="btn seg" :disabled="busy" @click="testOnly">测试连接</button>
          <button type="button" class="btn primary seg" :disabled="formDisabled" @click="() => save(false)">仅保存</button>
          <button type="button" class="btn primary seg" :disabled="formDisabled" @click="testAndSave">测试并保存</button>
          <button type="button" class="btn danger seg" v-if="draft.id" :disabled="formDisabled" @click="remove">删除</button>
        </div>
      </template>
      <div v-if="msg" :class="['msg', msgTone]">{{ msg }}</div>
    </template>
    <p v-else class="conn-placeholder">请点击上方连接标签查看详情，或点「+ 新建」添加连接。</p>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import { auditLog } from '@/lib/auditLog'
import '../../connection-form-pane.css'
import { shouldPreserveCreateDraftOnNullModel } from '../empty-connections-reload-policy'

const props = defineProps({
  modelValue: { type: Object, default: null },
  creatingNew: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadingMessage: { type: String, default: '正在加载已保存的连接…' },
  locked: { type: Boolean, default: false },
})
const emit = defineEmits(['updated', 'new', 'connection-tested'])

const msg = ref('')
const msgTone = ref('')
const busy = ref(false)
const formDisabled = computed(() => busy.value || props.locked)

/** 表单草稿：必须在任何 watch / 读 draft 之前声明，否则 immediate watch 挂载即崩 → 主区空白 */
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
  () => [props.modelValue, props.creatingNew],
  ([v, creating], prev) => {
    msg.value = ''
    msgTone.value = ''
    if (!v) {
      if (
        shouldPreserveCreateDraftOnNullModel({
          creatingNew: Boolean(creating),
          prevCreatingNew: prev === undefined ? undefined : Boolean(prev[1]),
          prevModelWasNull: prev === undefined ? undefined : prev[0] == null,
        })
      ) {
        return
      }
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

async function save(afterTest = false, { manageBusy = true } = {}) {
  if (props.locked) {
    msg.value = '数据源已锁定，无法保存'
    msgTone.value = 'err'
    return
  }
  if (manageBusy && busy.value) return
  msg.value = ''
  msgTone.value = ''
  if (manageBusy) busy.value = true
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
    // 立刻回写 id，避免 busy 结束后连点仍以 id=null 再插一条
    if (mine) draft.id = mine
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
      detail: { engine: draft.engine, after_test: afterTest, note: 'ui_echo' },
    })
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    if (manageBusy) busy.value = false
  }
}

async function runTest({ manageBusy = true } = {}) {
  if (manageBusy) busy.value = true
  try {
    const res = await apiFetch('/database/test', {
      method: 'POST',
      body: buildApiBody(),
    })
    return { ok: !!res.ok, message: res.message || '' }
  } catch (e) {
    return { ok: false, message: e.message || String(e) }
  } finally {
    if (manageBusy) busy.value = false
  }
}

async function testOnly() {
  if (busy.value) return
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
  if (props.locked) {
    msg.value = '数据源已锁定，无法保存'
    msgTone.value = 'err'
    return
  }
  if (busy.value) return
  msg.value = ''
  msgTone.value = ''
  busy.value = true
  try {
    const t = await runTest({ manageBusy: false })
    if (!t.ok) {
      msg.value = t.message || '连接失败'
      msgTone.value = 'err'
      return
    }
    await save(true, { manageBusy: false })
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (props.locked) {
    msg.value = '数据源已锁定，无法删除'
    msgTone.value = 'err'
    return
  }
  if (!draft.id) return
  if (busy.value) return
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

