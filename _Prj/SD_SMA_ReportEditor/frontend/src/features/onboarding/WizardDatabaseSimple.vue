<template>
  <div class="wiz-db-root">
    <p v-if="connectionListTruncated" class="db-trunc-banner">
      服务端配置的连接多于 <strong>{{ MAX_WIZ_DATABASE_SLOTS }}</strong>
      条，此处仅显示前 {{ MAX_WIZ_DATABASE_SLOTS }} 条；其余请到<strong>数据源配置 › 数据库工作台</strong>管理。
    </p>
    <header class="db-hero">
      <p class="db-lead">
        一页完成<strong>测试</strong>与<strong>保存</strong>（可多条连接，向导内至多 {{ MAX_WIZ_DATABASE_SLOTS }} 条）。大图示状态；修改表单后请以顶部或卡片内按钮重新验证。
      </p>
      <div class="db-toolbar">
        <div class="db-toolbar-summary" aria-live="polite">
          <span class="summ-title">连接状态总览</span>
          <ul class="summ-list">
            <li v-for="(slot, idx) in forms" :key="slot._key + '-s'" class="summ-item">
              <span class="summ-num">{{ connectionOrdinal(idx + 1) }}</span>
              <span :class="statusPillClass(slot)">{{ connectionStatusLabel(slot) }}</span>
              <span v-if="slotLooksFilled(slot) && isStale(slot)" class="stale-mini">表单已改动</span>
            </li>
          </ul>
        </div>
        <div class="db-toolbar-btns">
          <button
            type="button"
            class="btn btn-strong"
            :disabled="anyBusy || !forms.some(slotLooksFilled)"
            @click="testAllFilled"
          >
            一键测试全部
          </button>
          <button
            type="button"
            class="btn primary btn-strong"
            :disabled="anyBusy || !forms.some(slotLooksFilled)"
            @click="saveAllFilled"
          >
            一键保存全部
          </button>
          <button
            v-if="forms.length < MAX_WIZ_DATABASE_SLOTS"
            type="button"
            class="btn btn-ghost"
            :disabled="anyBusy"
            @click="addConnection"
          >
            ＋ 添加连接
          </button>
        </div>
      </div>
    </header>

    <div class="db-grid" :class="{ solo: forms.length === 1 }">
      <div v-for="(slot, idx) in forms" :key="slot._key" class="db-card">
        <div class="db-card-head">
          <div class="db-card-head-main">
            <h3 class="db-card-h">{{ connectionOrdinal(idx + 1) }}</h3>
            <span :class="statusPillClass(slot, true)">{{ connectionStatusLabel(slot) }}</span>
          </div>
          <button
            v-if="canRemoveSlot(slot)"
            type="button"
            class="btn textish sm"
            :disabled="anyBusy"
            @click="removeSlot(slot, idx)"
          >
            移除此连接
          </button>
        </div>

        <p v-if="slotLooksFilled(slot) && isStale(slot)" class="stale-banner">
          检测到<strong>表单已改动</strong>（与上次通过的测试/保存不一致），请重新测试后再保存。
        </p>

        <div class="db-fields">
          <label>连接名称</label>
          <input v-model="slot.name" class="inp" placeholder="例如：产线 MariaDB" :disabled="slot.busy" />

          <label>类型</label>
          <select v-model="slot.engine" class="inp" :disabled="slot.busy" @change="onEngineChange(slot)">
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="postgres">PostgreSQL</option>
            <option value="sqlite">SQLite</option>
            <option value="mongodb">MongoDB</option>
          </select>

          <template v-if="slot.engine !== 'sqlite'">
            <label>地址</label>
            <input v-model="slot.host" class="inp" placeholder="127.0.0.1" :disabled="slot.busy" />
            <label>端口</label>
            <input
              v-model="slot.portText"
              class="inp"
              type="text"
              inputmode="numeric"
              placeholder="留空则默认端口"
              :disabled="slot.busy"
            />
          </template>
          <template v-else>
            <label>SQLite 路径（后端服务器上的路径）</label>
            <input v-model="slot.sqlite_path" class="inp" placeholder="例如 D:\\data\\app.db" :disabled="slot.busy" />
            <label v-if="slot.engine === 'sqlite'">SQLite 加密密码（如有）</label>
            <input
              v-if="slot.engine === 'sqlite'"
              v-model="slot.password"
              class="inp"
              type="password"
              autocomplete="off"
              :placeholder="slot.id && slot.hasSavedPassword ? '留空沿用已保存密码' : '可选'"
              :disabled="slot.busy"
            />
          </template>

          <template v-if="slot.engine !== 'sqlite' && slot.engine !== 'mongodb'">
            <label>默认数据库名（可选）</label>
            <input v-model="slot.database" class="inp" placeholder="可先留空" :disabled="slot.busy" />
          </template>
          <template v-if="slot.engine === 'mongodb'">
            <label>默认数据库（可选）</label>
            <input v-model="slot.database" class="inp" :disabled="slot.busy" />
            <label>authSource</label>
            <input v-model="slot.mongo_auth_source" class="inp" placeholder="admin" :disabled="slot.busy" />
          </template>

          <template v-if="slot.engine !== 'sqlite'">
            <label>用户名</label>
            <input v-model="slot.username" class="inp" autocomplete="username" :disabled="slot.busy" />
            <label>密码</label>
            <input
              v-model="slot.password"
              class="inp"
              type="password"
              autocomplete="current-password"
              :placeholder="slot.id && slot.hasSavedPassword ? '留空沿用已保存密码' : '可选'"
              :disabled="slot.busy"
            />
          </template>
        </div>

        <div class="card-actions-inline">
          <button type="button" class="btn" :disabled="slot.busy" @click="testSlot(slot)">仅测试本条</button>
          <button type="button" class="btn primary" :disabled="slot.busy" @click="saveSlot(slot)">
            仅保存本条
          </button>
        </div>

        <p v-if="slot.feedback" :class="['fb', slot.feedbackOk ? 'ok' : 'err']">{{ slot.feedback }}</p>
      </div>
    </div>

    <p class="db-foot-note">
      向导会载入<strong>服务端已保存的全部连接</strong>（同一上限内）；与工作台数据源列表一致。
      Browse 表结构与 SQL 可到<strong>数据源配置 › 数据库工作台</strong>操作。
      <span v-if="forms.length >= MAX_WIZ_DATABASE_SLOTS" class="db-cap-hint">
        已达向导内条目上限（{{ MAX_WIZ_DATABASE_SLOTS }}）；更多连接请到数据库工作台。</span>
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/api/client.js'

/** 向导内同时编辑的条目数上限（防极端配置拖慢界面）；服务端可在工作台维护更多。 */
const MAX_WIZ_DATABASE_SLOTS = 64

const connectionListTruncated = ref(false)

let keySeq = 0
function nextKey() {
  keySeq += 1
  return `db-${keySeq}`
}

function defaultPortForEngine(engine) {
  if (engine === 'postgres') return 5432
  if (engine === 'mongodb') return 27017
  return 3306
}

/** linkState：idle | testing | test_ok | saved | fail */
function createBlankSlot() {
  const eng = 'mysql'
  return {
    _key: nextKey(),
    id: '',
    name: '',
    engine: eng,
    host: '127.0.0.1',
    portText: String(defaultPortForEngine(eng)),
    database: '',
    username: '',
    password: '',
    sqlite_path: '',
    mongo_auth_source: 'admin',
    hasSavedPassword: false,
    _prevEngine: eng,
    busy: false,
    feedback: '',
    feedbackOk: false,
    linkState: 'idle',
    verifyFp: '',
  }
}

function hydrateFromConn(c) {
  const eng = (c.engine || 'mysql').toLowerCase()
  const dp = defaultPortForEngine(eng)
  const p = c.port != null && c.port !== '' ? String(c.port) : String(dp)
  return {
    _key: nextKey(),
    id: c.id || '',
    name: c.name || '',
    engine: eng,
    host: c.host || '127.0.0.1',
    portText: p,
    database: c.database || '',
    username: c.username || '',
    password: '',
    sqlite_path: c.sqlite_path || '',
    mongo_auth_source: c.mongo_auth_source || 'admin',
    hasSavedPassword: !!c.has_password,
    _prevEngine: eng,
    busy: false,
    feedback: '',
    feedbackOk: false,
    linkState: 'idle',
    verifyFp: '',
  }
}

const forms = ref([createBlankSlot()])
const anyBusy = computed(() => forms.value.some((s) => s.busy))

function connectionOrdinal(n) {
  return `连接 ${n}`
}

function canRemoveSlot(slot) {
  if (forms.value.length > 1) return true
  return !!slot.id
}

function slotLooksFilled(slot) {
  const n = (slot.name || '').trim()
  if (!n) return false
  if (slot.engine === 'sqlite') return !!(slot.sqlite_path || '').trim()
  return !!(slot.host || '').trim()
}

function fingerprintBody(slot) {
  try {
    return JSON.stringify(buildApiBody(slot))
  } catch {
    return ''
  }
}

function isStale(slot) {
  if (!slot.verifyFp) return false
  return fingerprintBody(slot) !== slot.verifyFp
}

function connectionStatusLabel(slot) {
  if (!slotLooksFilled(slot)) return '尚未填写必填项'
  if (slot.linkState === 'testing') return '检测中…'
  if (slot.linkState === 'fail') return '未连通（见下方说明）'
  if (slot.linkState === 'test_ok') return '测试通过（未写入）'
  if (slot.linkState === 'saved') return '已保存 · 最近一次验证通过'
  if (slot.id && slot.linkState === 'idle') return '已保存记录（建议点此页「测试」确认）'
  return '待检测'
}

function statusPillClass(slot, lg = false) {
  const base = lg ? ['pill', 'pill-lg'] : ['pill']
  if (!slotLooksFilled(slot)) {
    base.push('muted')
    return base
  }
  switch (slot.linkState) {
    case 'saved':
      base.push('ok')
      break
    case 'test_ok':
      base.push('hint')
      break
    case 'fail':
      base.push('bad')
      break
    case 'testing':
      base.push('spin')
      break
    default:
      base.push('idle')
  }
  if (slot.id && slot.linkState === 'idle') base.push('warn-soft')
  return base
}

function effectivePort(slot) {
  const raw = String(slot.portText ?? '').trim()
  if (!raw) return defaultPortForEngine(slot.engine)
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1 || n > 65535) return defaultPortForEngine(slot.engine)
  return n
}

function buildApiBody(slot) {
  const engine = slot.engine
  const port = effectivePort(slot)
  const common = {
    id: slot.id || null,
    name: (slot.name || '').trim(),
    engine,
    database: (slot.database || '').trim() || null,
    mongo_auth_source: (slot.mongo_auth_source || 'admin').trim() || 'admin',
  }
  if (engine === 'sqlite') {
    return {
      ...common,
      host: null,
      port: null,
      username: null,
      password: slot.password ? slot.password : null,
      sqlite_path: (slot.sqlite_path || '').trim() || null,
    }
  }
  return {
    ...common,
    host: (slot.host || '').trim() || '127.0.0.1',
    port,
    username: (slot.username || '').trim() || null,
    password: slot.password ? slot.password : null,
    sqlite_path: null,
  }
}

function onEngineChange(slot) {
  const prev = slot._prevEngine || slot.engine
  const prevDefault = String(defaultPortForEngine(prev))
  const cur = String(slot.portText ?? '').trim()
  if (!cur || cur === prevDefault) {
    slot.portText = String(defaultPortForEngine(slot.engine))
  }
  slot._prevEngine = slot.engine
}

async function reloadFromServer() {
  try {
    connectionListTruncated.value = false
    const data = await apiFetch('/database/connections')
    const list = data.connections || []
    if (list.length === 0) {
      forms.value = [createBlankSlot()]
      return
    }
    let use = list
    if (list.length > MAX_WIZ_DATABASE_SLOTS) {
      connectionListTruncated.value = true
      use = list.slice(0, MAX_WIZ_DATABASE_SLOTS)
    }
    forms.value = use.map(hydrateFromConn)
  } catch {
    connectionListTruncated.value = false
    forms.value = [createBlankSlot()]
  }
}

onMounted(() => {
  reloadFromServer()
})

function addConnection() {
  if (forms.value.length >= MAX_WIZ_DATABASE_SLOTS) return
  forms.value.push(createBlankSlot())
}

async function removeSlot(slot, idx) {
  if (slot.id) {
    slot.busy = true
    slot.feedback = ''
    try {
      await apiFetch(`/database/connections/${slot.id}`, { method: 'DELETE' })
    } catch (e) {
      slot.busy = false
      slot.feedback = e.message || String(e)
      slot.feedbackOk = false
      return
    }
    slot.busy = false
  }
  const next = forms.value.filter((_, i) => i !== idx)
  if (next.length === 0) {
    next.push(createBlankSlot())
  }
  forms.value = next
}

async function runTest(slot) {
  const res = await apiFetch('/database/test', {
    method: 'POST',
    body: buildApiBody(slot),
  })
  return { ok: !!res.ok, message: res.message || '' }
}

async function testSlot(slot) {
  slot.feedback = ''
  slot.busy = true
  slot.linkState = 'testing'
  try {
    const res = await runTest(slot)
    if (res.ok) {
      slot.verifyFp = fingerprintBody(slot)
      slot.linkState = slot.id ? 'saved' : 'test_ok'
      slot.feedback = slot.id ? '连接测试成功（与已保存项一致的可直接下一步）' : '连接测试成功（尚未写入配置）'
      slot.feedbackOk = true
    } else {
      slot.linkState = 'fail'
      slot.feedback = res.message || '连接失败'
      slot.feedbackOk = false
    }
  } catch (e) {
    slot.linkState = 'fail'
    slot.feedback = e.message || String(e)
    slot.feedbackOk = false
  } finally {
    slot.busy = false
  }
}

async function saveSlot(slot) {
  slot.feedback = ''
  slot.busy = true
  slot.linkState = 'testing'
  try {
    const t = await runTest(slot)
    if (!t.ok) {
      slot.linkState = 'fail'
      slot.feedback = t.message || '连接失败，未保存'
      slot.feedbackOk = false
      return
    }
    const data = await apiFetch('/database/connections', {
      method: 'POST',
      body: buildApiBody(slot),
    })
    const list = data.connections || []
    const sid = data.saved_id
    const mine =
      sid ||
      list.find((x) => x.name === (slot.name || '').trim() && x.engine === slot.engine)?.id ||
      list[list.length - 1]?.id ||
      null
    if (mine) {
      slot.id = mine
      const row = list.find((x) => x.id === mine)
      slot.hasSavedPassword = !!(row && row.has_password)
      slot.password = ''
    }
    slot.verifyFp = fingerprintBody(slot)
    slot.linkState = 'saved'
    slot.feedback = '已保存到本机并完成连通性校验'
    slot.feedbackOk = true
  } catch (e) {
    slot.linkState = 'fail'
    slot.feedback = e.message || String(e)
    slot.feedbackOk = false
  } finally {
    slot.busy = false
  }
}

async function testAllFilled() {
  for (const slot of forms.value) {
    if (!slotLooksFilled(slot)) continue
    await testSlot(slot)
  }
}

async function saveAllFilled() {
  for (const slot of forms.value) {
    if (!slotLooksFilled(slot)) continue
    await saveSlot(slot)
  }
}
</script>

<style scoped>
.wiz-db-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: min(100%, 1280px);
}

.db-trunc-banner {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 8px 12px;
}

.db-cap-hint {
  display: block;
  margin-top: 6px;
  color: #b45309;
}

.db-lead {
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  margin: 0;
}

.db-hero {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.db-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 72%);
}

.db-toolbar-summary {
  flex: 1;
  min-width: 240px;
}

.summ-title {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 8px;
}

.summ-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(200px, 32vh);
  overflow-y: auto;
}

.summ-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.summ-num {
  color: #475569;
  min-width: 5.75em;
  flex-shrink: 0;
}

.stale-mini {
  font-size: 11px;
  color: #c2410c;
  background: #fff7ed;
  padding: 2px 6px;
  border-radius: 4px;
}

.db-toolbar-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.db-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  gap: 16px;
  align-items: start;
}

.db-grid.solo {
  grid-template-columns: minmax(0, 520px);
}

.db-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.db-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 10px;
}

.db-card-head-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.db-card-h {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.stale-banner {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #9a3412;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 8px 10px;
}

.db-fields {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
}

.db-fields label {
  font-size: 12px;
  color: #475569;
}

.db-fields input,
.db-fields select {
  grid-column: 2;
}

.card-actions-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 4px;
}

.db-foot-note {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

.inp {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.inp:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.18);
}

.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  color: #334155;
}
.btn.primary {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
.btn.strong {
  font-weight: 600;
}
.btn-ghost {
  border-style: dashed;
  border-color: #94a3b8;
}
.btn.textish {
  border: none;
  background: transparent;
  color: #64748b;
  padding: 4px 6px;
  text-decoration: underline;
}
.btn.sm {
  font-size: 12px;
  padding: 4px 8px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.pill-lg {
  font-size: 12px;
  padding: 5px 12px;
}

.pill.ok {
  background: #dcfce7;
  color: #166534;
  border-color: #86efac;
}
.pill.hint {
  background: #e0e7ff;
  color: #3730a3;
  border-color: #c7d2fe;
}
.pill.bad {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}
.pill.idle,
.pill.muted {
  background: #f1f5f9;
  color: #64748b;
  border-color: #e2e8f0;
}
.pill.warn-soft {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}
.pill.spin {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
  animation: pill-pulse 1.1s ease-in-out infinite;
}

@keyframes pill-pulse {
  50% {
    opacity: 0.78;
  }
}

.fb {
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
}

.fb.ok {
  color: #047857;
}
.fb.err {
  color: #b91c1c;
}
</style>
