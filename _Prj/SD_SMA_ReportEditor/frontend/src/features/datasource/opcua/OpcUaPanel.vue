<template>
  <div class="opcua">
    <div class="cols">
      <aside class="list-pane">
        <div class="list-head">
          <span>已保存连接</span>
          <button type="button" class="btn sm" @click="startNew">新建</button>
        </div>
        <ul class="server-ul">
          <li
            v-for="s in servers"
            :key="s.id"
            :class="{ active: selected?.id === s.id }"
            @click="selectServer(s)"
          >
            {{ s.name || s.endpoint_url }}
          </li>
        </ul>
      </aside>
      <div class="form-pane">
        <label>名称</label>
        <input v-model="form.name" class="input" />
        <label>Endpoint URL</label>
        <input v-model="form.endpoint_url" class="input" placeholder="opc.tcp://host:4840" />
        <label>用户名（可选）</label>
        <input v-model="form.username" class="input" />
        <label>密码（可选）</label>
        <input v-model="form.password" type="password" class="input" autocomplete="new-password" />
        <div class="actions">
          <button type="button" class="btn primary sm" @click="saveServer">保存</button>
          <button type="button" class="btn sm" @click="testDraft">测试连接（当前表单）</button>
          <button type="button" class="btn danger sm" v-if="form.id" @click="removeServer">删除</button>
        </div>
        <div v-if="msg" class="msg">{{ msg }}</div>
      </div>
      <div class="browse-pane" v-if="form.id">
        <div class="browse-head">
          <span>地址空间</span>
          <button type="button" class="btn sm" @click="refreshRoot">刷新根</button>
        </div>
        <div class="browse-body">
          <div class="tree-wrap">
            <OpcUaTree
              :nodes="treeNodes"
              :tree-rev="treeRev"
              @toggle="onToggleNode"
              @pick="pickNode"
            />
          </div>
          <div class="detail-wrap">
            <div v-if="pickedNode" class="detail">
              <div class="detail-line">
                <strong>节点</strong>
                <span class="detail-nid mono">{{ pickedNode.node_id }}</span>
              </div>
              <div v-if="pickedNode.node_id" class="copy-block">
                <div class="copy-block-head">
                  <span>连接与 NodeId（可复制到其他 OPC UA 客户端）</span>
                  <button type="button" class="btn sm" @click="copyConnectionInfo">复制全部</button>
                </div>
                <pre class="copy-pre mono">{{ connectionInfoText }}</pre>
                <p v-if="copyFeedback" class="copy-feedback">{{ copyFeedback }}</p>
              </div>
              <button type="button" class="btn sm" @click="readValue">重新读取</button>
              <div class="poll-row">
                <label class="poll-label">
                  <input v-model="pollEnabled" type="checkbox" class="poll-checkbox" />
                  <span class="poll-label-text">持续刷新</span>
                </label>
                <span v-if="pollEnabled" class="poll-interval">
                  <label for="opc-poll-interval">间隔</label>
                  <input
                    id="opc-poll-interval"
                    v-model.number="pollIntervalSeconds"
                    type="number"
                    min="0.5"
                    max="300"
                    step="0.5"
                    class="input input-tiny"
                  />
                  <span class="poll-hint">秒</span>
                </span>
              </div>
              <p v-if="pollEnabled && !canPollCurrent" class="poll-warn">开启后请选中 Variable 节点；仅对该节点定时读值（0.5～300 秒一轮）</p>
              <pre v-if="readOut" class="pre">{{ readOut }}</pre>
            </div>
            <div v-else class="detail-placeholder">展开层级后 Variable 会在左侧自动显示数值；点击节点可看右侧 JSON</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import OpcUaTree from './OpcUaTree.vue'

const servers = ref([])
const selected = ref(null)
const form = reactive({
  id: '',
  name: '',
  endpoint_url: '',
  username: '',
  password: '',
})
const msg = ref('')
const treeNodes = shallowRef([])
const treeRev = ref(0)
const pickedNode = ref(null)
const readOut = ref('')
/** 选中节点切换时递增，丢弃过期的读值请求 */
const readEpoch = ref(0)
/** 浏览结果刷新后递增，作废进行中的 Variable 预读请求 */
const prefetchGen = ref(0)

const copyFeedback = ref('')

/** 定时读当前选中 Variable（轮询）；与 readEpoch 无关 */
const pollEnabled = ref(false)
const pollIntervalSeconds = ref(2)
let pollTimerId = null
let pollInFlight = false

function bumpTree() {
  treeRev.value += 1
  triggerRef(treeNodes)
}

function wrapOpcNode(raw) {
  return {
    ...raw,
    children: [],
    expanded: false,
    loading: false,
    loaded: false,
    errorMessage: null,
  }
}

const activeServer = computed(() => servers.value.find((s) => s.id === form.id) || null)

const connectionInfoText = computed(() => {
  const n = pickedNode.value
  if (!n?.node_id) return ''
  const ep = (form.endpoint_url || '').trim()
  const srv = activeServer.value
  const meta = {
    opcua_endpoint_url: ep || null,
    node_id: n.node_id,
    browse_name: n.browse_name || null,
    display_name: n.display_name || null,
    node_class: n.node_class || null,
    security_policy: srv?.security_policy ?? null,
    message_security_mode: srv?.message_security_mode ?? null,
    username: form.username || null,
    connection_name: form.name || srv?.name || null,
  }
  const json = JSON.stringify(meta, null, 2)
  const tabLine = ep ? `${ep}\t${n.node_id}` : n.node_id
  return [
    '--- 快速粘贴（Endpoint<TAB>NodeId）---',
    tabLine,
    '',
    '--- 可读行 ---',
    `Endpoint:\t${ep || '（未填写）'}`,
    `NodeId:\t${n.node_id}`,
    `BrowseName:\t${n.browse_name || '—'}`,
    `DisplayName:\t${n.display_name || '—'}`,
    `NodeClass:\t${n.node_class || '—'}`,
    '',
    '--- JSON（程序化对接）---',
    json,
  ].join('\n')
})

async function copyConnectionInfo() {
  const text = connectionInfoText.value
  if (!text) return
  copyFeedback.value = ''
  try {
    await navigator.clipboard.writeText(text)
    copyFeedback.value = '已复制到剪贴板'
    setTimeout(() => {
      copyFeedback.value = ''
    }, 2500)
  } catch (e) {
    msg.value = `复制失败：${e.message || String(e)}`
  }
}

function pickPreferredOpcServerId(prefs, srvs, explicitPreferred) {
  const list = srvs || []
  if (explicitPreferred && list.some((s) => s.id === explicitPreferred)) {
    return explicitPreferred
  }
  if (!prefs || prefs.auto_select_last_opcua_server === false) {
    return null
  }
  const def = prefs.default_opcua_server_id
  if (def && list.some((s) => s.id === def)) {
    return def
  }
  const last = prefs.last_opcua_server_id
  if (last && list.some((s) => s.id === last)) {
    return last
  }
  return null
}

async function persistLastOpcuaServer(id) {
  if (!id) return
  try {
    await apiFetch('/settings/app_preferences', {
      method: 'PATCH',
      body: { last_opcua_server_id: id },
    })
  } catch {
    /* ignore */
  }
}

async function loadServers(explicitPreferred = null) {
  let prefs = {}
  try {
    prefs = await apiFetch('/settings/app_preferences')
  } catch {
    prefs = {}
  }
  const data = await apiFetch('/opcua/servers')
  servers.value = data.servers || []
  if (!servers.value.length) {
    startNew()
    return
  }
  const pid = pickPreferredOpcServerId(prefs, servers.value, explicitPreferred)
  if (pid) {
    const s = servers.value.find((x) => x.id === pid)
    if (s) {
      selectServer(s, false)
      return
    }
  }
  const curId = form.id
  if (curId && servers.value.some((x) => x.id === curId)) {
    selectServer(servers.value.find((x) => x.id === curId), false)
    return
  }
  selectServer(servers.value[0], false)
}

function selectServer(s, persist = true) {
  selected.value = s
  form.id = s.id
  form.name = s.name || ''
  form.endpoint_url = s.endpoint_url || ''
  form.username = s.username || ''
  form.password = ''
  msg.value = ''
  treeNodes.value = []
  pickedNode.value = null
  readOut.value = ''
  readEpoch.value += 1
  if (persist) {
    void persistLastOpcuaServer(s.id)
  }
  refreshRoot()
}

function startNew() {
  selected.value = null
  form.id = ''
  form.name = ''
  form.endpoint_url = ''
  form.username = ''
  form.password = ''
  treeNodes.value = []
  pickedNode.value = null
  readOut.value = ''
  readEpoch.value += 1
}

async function saveServer() {
  msg.value = ''
  try {
    const postRes = await apiFetch('/opcua/servers', {
      method: 'POST',
      body: {
        id: form.id || null,
        name: form.name,
        endpoint_url: form.endpoint_url,
        username: form.username || null,
        password: form.password || null,
      },
    })
    const list = postRes.servers || []
    const nm = String(form.name || '').trim()
    const ep = String(form.endpoint_url || '').trim()
    const created =
      list.find((x) => String(x.name || '').trim() === nm && String(x.endpoint_url || '').trim() === ep) ||
      list.find((x) => String(x.endpoint_url || '').trim() === ep)
    await loadServers(created?.id || null)
    if (created?.id) {
      await persistLastOpcuaServer(created.id)
    }
    msg.value = '已保存'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function removeServer() {
  if (!form.id) return
  await apiFetch(`/opcua/servers/${form.id}`, { method: 'DELETE' })
  await loadServers()
  startNew()
}

async function testDraft() {
  msg.value = ''
  try {
    const res = await apiFetch('/opcua/test', {
      method: 'POST',
      body: {
        endpoint_url: form.endpoint_url,
        username: form.username || null,
        password: form.password || null,
      },
    })
    msg.value = res.ok ? '连接成功' : res.message || '失败'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function refreshRoot() {
  if (!form.id) return
  prefetchGen.value += 1
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, { method: 'POST', body: {} })
    if (res.ok === false) {
      msg.value = res.message || '浏览失败'
      treeNodes.value = []
      bumpTree()
      return
    }
    const list = res.nodes || []
    treeNodes.value = list.map((n) => wrapOpcNode(n))
    bumpTree()
    void prefetchVariableValuesInNodes(treeNodes.value)
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function onToggleNode(node) {
  if (!form.id || !node.node_id || node.loading) return
  if (node.loaded) {
    node.expanded = !node.expanded
    bumpTree()
    return
  }
  node.loading = true
  node.errorMessage = null
  bumpTree()
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: node.node_id },
    })
    if (res.ok === false) {
      node.errorMessage = res.message || '浏览失败'
      msg.value = node.errorMessage
      return
    }
    const list = res.nodes || []
    node.children = list.map((n) => wrapOpcNode(n))
    node.loaded = true
    node.expanded = true
    void prefetchVariableValuesInNodes(node.children)
  } catch (e) {
    node.errorMessage = e.message || String(e)
    msg.value = node.errorMessage
  } finally {
    node.loading = false
    bumpTree()
  }
}

/** 仅 OPC Variable 类节点在树上展示读值；Object/VariableType 等不展示 */
function isOpcVariableValueNode(n) {
  const c = (n?.node_class || '').trim()
  if (!c) return false
  const u = c.toUpperCase()
  if (u.includes('VARIABLETYPE')) return false
  return u === 'VARIABLE'
}

const canPollCurrent = computed(
  () => !!(form.id && pickedNode.value?.node_id && isOpcVariableValueNode(pickedNode.value)),
)

/** 树行快捷展示的读值摘要（不含完整 JSON） */
function formatOpcValuePreview(res) {
  if (!res || res.ok === false) return ''
  const v = res.value
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  const t = typeof v
  if (t === 'object') {
    try {
      const s = JSON.stringify(v)
      return s.length > 88 ? `${s.slice(0, 85)}…` : s
    } catch {
      return String(v)
    }
  }
  if (t === 'string') {
    return v.length > 72 ? `${v.slice(0, 69)}…` : v
  }
  return String(v)
}

/** 当前层级加载完成后，为所有 Variable 自动读值并填树行（无需逐节点点击） */
const VARIABLE_PREFETCH_CONCURRENCY = 4

async function prefetchVariableValuesInNodes(nodes) {
  if (!form.id || !nodes?.length) return
  const myGen = prefetchGen.value
  const targets = nodes.filter((n) => n.node_id && isOpcVariableValueNode(n))
  for (let i = 0; i < targets.length; i += VARIABLE_PREFETCH_CONCURRENCY) {
    if (prefetchGen.value !== myGen || !form.id) return
    const batch = targets.slice(i, i + VARIABLE_PREFETCH_CONCURRENCY)
    await Promise.all(batch.map((node) => prefetchVariableTreeRow(node, myGen)))
  }
}

async function prefetchVariableTreeRow(node, myGen) {
  if (!form.id || prefetchGen.value !== myGen || !node?.node_id || !isOpcVariableValueNode(node)) return
  try {
    const res = await apiFetch(`/opcua/read_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: node.node_id },
    })
    if (prefetchGen.value !== myGen || !form.id) return
    if (res.ok === false) {
      node.valuePreview = ''
      node.valueReadError = res.message || '读值失败'
    } else {
      node.valueReadError = null
      node.valuePreview = formatOpcValuePreview(res)
    }
    bumpTree()
  } catch (e) {
    if (prefetchGen.value !== myGen) return
    node.valuePreview = ''
    node.valueReadError = e.message || String(e)
    bumpTree()
  }
}

function pickNode(n) {
  pickedNode.value = n
  readOut.value = ''
  readEpoch.value += 1
  const epoch = readEpoch.value
  if (form.id && n?.node_id && isOpcVariableValueNode(n)) {
    void fetchNodeValue(n, epoch)
  }
}

async function fetchNodeValue(node, epoch, { manual = false } = {}) {
  if (!form.id || !node?.node_id) return
  const showInTree = isOpcVariableValueNode(node)
  if (!manual && !showInTree) return

  const nodeId = node.node_id
  try {
    const res = await apiFetch(`/opcua/read_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: nodeId },
    })
    if (epoch !== readEpoch.value) return
    readOut.value = JSON.stringify(res, null, 2)
    if (showInTree) {
      if (res.ok === false) {
        node.valuePreview = ''
        node.valueReadError = res.message || '读值失败'
      } else {
        node.valueReadError = null
        node.valuePreview = formatOpcValuePreview(res)
      }
      bumpTree()
    }
  } catch (e) {
    if (epoch !== readEpoch.value) return
    readOut.value = e.message || String(e)
    if (showInTree) {
      node.valuePreview = ''
      node.valueReadError = e.message || String(e)
      bumpTree()
    }
  }
}

async function readValue() {
  if (!form.id || !pickedNode.value?.node_id) return
  readEpoch.value += 1
  const epoch = readEpoch.value
  await fetchNodeValue(pickedNode.value, epoch, { manual: true })
}

function clampPollSeconds(v) {
  const n = Number(v)
  if (Number.isNaN(n) || n < 0.5) return 0.5
  if (n > 300) return 300
  return n
}

function clearPollTimer() {
  if (pollTimerId != null) {
    clearInterval(pollTimerId)
    pollTimerId = null
  }
}

async function pollSelectedVariableOnce() {
  if (!pollEnabled.value || !form.id || pollInFlight) return
  const n = pickedNode.value
  if (!n?.node_id || !isOpcVariableValueNode(n)) return
  pollInFlight = true
  try {
    const res = await apiFetch(`/opcua/read_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: n.node_id },
    })
    if (!pollEnabled.value || pickedNode.value !== n || !form.id) return
    readOut.value = JSON.stringify(res, null, 2)
    if (res.ok === false) {
      n.valuePreview = ''
      n.valueReadError = res.message || '读值失败'
    } else {
      n.valueReadError = null
      n.valuePreview = formatOpcValuePreview(res)
    }
    bumpTree()
  } catch (e) {
    if (!pollEnabled.value || pickedNode.value !== n) return
    readOut.value = e.message || String(e)
    n.valuePreview = ''
    n.valueReadError = e.message || String(e)
    bumpTree()
  } finally {
    pollInFlight = false
  }
}

function syncPollTimer() {
  clearPollTimer()
  if (!pollEnabled.value || !form.id) return
  const n = pickedNode.value
  if (!n?.node_id || !isOpcVariableValueNode(n)) return
  const ms = Math.round(clampPollSeconds(pollIntervalSeconds.value) * 1000)
  void pollSelectedVariableOnce()
  pollTimerId = window.setInterval(() => void pollSelectedVariableOnce(), ms)
}

watch(
  [pollEnabled, pollIntervalSeconds, () => form.id, () => pickedNode.value],
  () => {
    syncPollTimer()
  },
  { flush: 'post' },
)

watch(pollIntervalSeconds, (v) => {
  const c = clampPollSeconds(v)
  if (c !== v) pollIntervalSeconds.value = c
})

function onConfigImported() {
  void loadServers()
}

onMounted(() => {
  void loadServers()
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onBeforeUnmount(() => {
  clearPollTimer()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})
</script>

<style scoped>
.opcua {
  width: 100%;
  min-width: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cols {
  display: grid;
  grid-template-columns: 200px minmax(240px, 280px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.list-pane,
.form-pane,
.browse-pane {
  min-width: 0;
  min-height: 0;
}
.list-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
}
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}
.server-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.server-ul li {
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.server-ul li.active {
  background: #eef2ff;
  color: #4338ca;
}
.form-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.browse-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.browse-body {
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
@media (max-width: 1100px) {
  .browse-body {
    flex-direction: column;
    overflow-y: auto;
  }
  .tree-wrap {
    flex: 1 1 auto;
    max-height: 50vh;
    min-height: 140px;
  }
  .detail-wrap {
    flex: 1 1 auto;
    max-height: 50vh;
    min-height: 140px;
    width: 100%;
  }
}
.tree-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  padding: 8px 4px;
  background: #fafafa;
}
.detail-wrap {
  flex: 0 1 400px;
  width: min(400px, 42vw);
  min-width: 260px;
  max-width: 100%;
  min-height: 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-x: hidden;
  overflow-y: auto;
}
.detail-placeholder {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 0;
}
.detail-line {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 13px;
  word-break: break-all;
}
.detail-nid {
  font-size: 11px;
  color: #4b5563;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
label {
  font-size: 12px;
  color: #374151;
}
.input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.btn {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn.danger {
  border-color: #fecaca;
  color: #b91c1c;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.msg {
  font-size: 13px;
  color: #374151;
}
.browse-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.detail {
  font-size: 13px;
  padding: 8px 0;
}
.copy-block {
  margin-bottom: 10px;
  padding: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.copy-block-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #4b5563;
  line-height: 1.4;
}
.copy-pre {
  margin: 0;
  padding: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}
.copy-feedback {
  margin: 6px 0 0;
  font-size: 12px;
  color: #059669;
}
.pre {
  background: #111827;
  color: #e5e7eb;
  padding: 8px;
  border-radius: 6px;
  overflow: auto;
  font-size: 12px;
  margin-top: 8px;
}
.poll-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: #374151;
}
.poll-label {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  min-height: 44px;
  padding: 6px 10px 6px 8px;
  margin: 0;
  border-radius: 8px;
  box-sizing: border-box;
}
.poll-checkbox {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  margin: 0;
  cursor: pointer;
  accent-color: #2563eb;
  flex-shrink: 0;
}
.poll-label-text {
  font-size: 14px;
  line-height: 1.3;
}
.poll-interval {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.poll-interval label {
  margin: 0;
}
.poll-hint {
  color: #6b7280;
  font-size: 11px;
}
.input-tiny {
  width: 4.5rem;
  padding: 6px 8px;
  font-size: 13px;
}
.poll-warn {
  margin: 6px 0 0;
  font-size: 11px;
  color: #92400e;
  line-height: 1.4;
}
</style>
