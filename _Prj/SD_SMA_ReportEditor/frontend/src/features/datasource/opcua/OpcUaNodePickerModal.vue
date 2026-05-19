<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="overlayRef"
      class="opc-pick-overlay"
      tabindex="-1"
      role="presentation"
      @click.self="close"
      @keydown.esc.prevent="close"
    >
      <div
        class="opc-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opc-pick-title"
        @keydown.esc.stop.prevent="close"
      >
        <header class="opc-pick-head">
          <h2 id="opc-pick-title">选择 OPC UA 节点</h2>
          <button type="button" class="opc-pick-close" aria-label="关闭" @click="close">×</button>
        </header>
        <p class="opc-pick-lead">
          请选择<strong>已保存的连接</strong>（在「数据源」页新增 OPC UA 服务器），展开地址空间后点击节点，再按「确定绑定」写入 NodeId。仍可随后在输入框中手工微调。
        </p>
        <div class="opc-pick-srv">
          <label class="opc-pick-srv-lbl">
            <span>连接</span>
            <select v-model="selectedServerId" class="opc-pick-select" @change="onServerChange">
              <option value="">— 请选择 —</option>
              <option v-for="s in servers" :key="s.id" :value="s.id">{{ labelServer(s) }}</option>
            </select>
          </label>
          <button type="button" class="opc-pick-btn" :disabled="!browseCapability" @click="refreshRoot">
            刷新根
          </button>
        </div>
        <p v-if="servers.length === 0 && !loadErr" class="opc-pick-warn">
          暂无已保存连接。请先到侧边或通过路由打开<strong>数据源</strong>，在 OPC UA 页保存 Endpoint。
        </p>
        <p v-if="loadErr" class="opc-pick-msg opc-pick-msg-err">{{ translateOpcuaMessage(loadErr) }}</p>
        <p v-else-if="msg" class="opc-pick-msg">{{ translateOpcuaMessage(msg) }}</p>
        <div class="opc-pick-search">
          <label class="opc-pick-search-lbl">
            <span>搜索变量</span>
            <input
              v-model="searchQuery"
              type="search"
              class="opc-pick-search-inp"
              placeholder="显示名、BrowseName、NodeId…（从 Objects 扫描全地址空间）"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <p class="opc-pick-search-hint">
            后台从 <strong>Objects</strong> 广度优先扫描，匹配<strong>变量（Variable）</strong>；无需事先展开树。
          </p>
        </div>
        <div class="opc-pick-tree">
          <template v-if="searchTrimmed">
            <div v-if="searchRemoteLoading" class="opc-pick-search-status">正在搜索地址空间…</div>
            <div v-else-if="searchRemoteError" class="opc-pick-search-empty">
              {{ translateOpcuaMessage(searchRemoteError) }}
            </div>
            <div v-else-if="!searchHitEntries.length" class="opc-pick-search-empty">
              无匹配的变量节点，请更换或缩短关键字。
            </div>
            <template v-else>
              <ul class="opc-pick-hit-list" role="listbox">
                <li
                  v-for="(hit, idx) in searchHitEntries"
                  :key="'hit-' + idx + '-' + (hit.node.node_id || idx)"
                >
                  <button type="button" class="opc-pick-hit" @click="pickNode(hit.node)">
                    <span class="opc-pick-hit-path">{{ hit.pathStr }}</span>
                    <span class="opc-pick-hit-id mono">{{ hit.node.node_id }}</span>
                  </button>
                </li>
              </ul>
              <p v-if="searchRemoteInfo" class="opc-pick-search-meta">{{ searchRemoteInfo }}</p>
            </template>
          </template>
          <OpcUaTree v-else :nodes="treeNodes" :tree-rev="treeRev" @toggle="onToggleNode" @pick="pickNode" />
        </div>
        <footer class="opc-pick-foot">
          <div class="opc-pick-preview mono">{{ pickedNode?.node_id || '（未选择节点）' }}</div>
          <div class="opc-pick-actions">
            <button type="button" class="opc-pick-btn" @click="close">取消</button>
            <button type="button" class="opc-pick-btn primary" :disabled="!pickedNode?.node_id" @click="confirmPick">
              确定绑定
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, triggerRef, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import OpcUaTree from './OpcUaTree.vue'
import { translateOpcuaMessage } from './opcua-messages.js'
import { opcDataTypeLabelFromRead } from './opcua-value-meta.js'
import { isOpcVariableValueNode } from './opcua-tree-utils.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const servers = ref([])
const selectedServerId = ref('')
const loadErr = ref('')
const msg = ref('')
const treeNodes = shallowRef([])
const treeRev = ref(0)
const pickedNode = ref(null)
const prefetchGen = ref(0)
const overlayRef = ref(null)
const searchQuery = ref('')

const searchTrimmed = computed(() => (searchQuery.value || '').trim())

const searchHitEntries = ref([])
const searchRemoteLoading = ref(false)
const searchRemoteError = ref('')
const searchRemoteInfo = ref('')
let searchDebounceTimer = null
let searchRequestGen = 0

const browseCapability = computed(() => {
  const id = (selectedServerId.value || '').trim()
  if (!id) return null
  return { kind: 'saved', serverId: id }
})

function labelServer(s) {
  const n = (s.name || '').trim()
  const ep = (s.endpoint_url || '').trim()
  return n ? `${n} · ${ep}` : ep || s.id
}

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
    valueDataTypeLabel: '',
  }
}

function opcHitToPickEntry(h) {
  const node = wrapOpcNode({
    node_id: h.node_id,
    browse_name: h.browse_name,
    display_name: h.display_name,
    node_class: h.node_class,
  })
  return { node, pathStr: h.path_str || '' }
}

async function opcApiSearchVariables(query) {
  const cap = browseCapability.value
  if (!cap) throw new Error('当前无法搜索')
  const q = String(query || '').trim()
  return await apiFetch(`/opcua/search_saved/${cap.serverId}`, {
    method: 'POST',
    body: { query: q },
  })
}

async function runPickModalVariableSearch(q, runGen) {
  if (runGen !== searchRequestGen) return
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchHitEntries.value = []
  if (!browseCapability.value) {
    searchRemoteError.value = '请先选择已保存的 OPC UA 连接'
    return
  }
  searchRemoteLoading.value = true
  try {
    const res = await opcApiSearchVariables(q)
    if (runGen !== searchRequestGen) return
    searchRemoteLoading.value = false
    if (res.ok === false) {
      searchRemoteError.value = res.message || '搜索失败'
      return
    }
    searchHitEntries.value = (res.hits || []).map(opcHitToPickEntry)
    if (res.truncated) {
      searchRemoteInfo.value = `已扫描约 ${res.nodes_scanned ?? '—'} 个节点；范围或结果已达上限，请缩小关键字。`
    }
  } catch (e) {
    if (runGen !== searchRequestGen) return
    searchRemoteLoading.value = false
    searchRemoteError.value = e.message || String(e)
  }
}

async function opcApiBrowse(parentNodeId) {
  const cap = browseCapability.value
  if (!cap) throw new Error('当前无法浏览')
  const body = parentNodeId != null && parentNodeId !== '' ? { node_id: parentNodeId } : {}
  return await apiFetch(`/opcua/browse_saved/${cap.serverId}`, { method: 'POST', body })
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

async function loadServersWhenOpen() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  searchRequestGen++
  searchHitEntries.value = []
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchRemoteLoading.value = false
  loadErr.value = ''
  msg.value = ''
  searchQuery.value = ''
  servers.value = []
  selectedServerId.value = ''
  treeNodes.value = []
  pickedNode.value = null
  prefetchGen.value += 1
  bumpTree()
  try {
    let prefs = {}
    try {
      prefs = await apiFetch('/settings/app_preferences')
    } catch {
      prefs = {}
    }
    const data = await apiFetch('/opcua/servers')
    servers.value = data.servers || []
    if (!servers.value.length) {
      return
    }
    const pid = pickPreferredOpcServerId(prefs, servers.value, null)
    selectedServerId.value = pid || servers.value[0].id
    await refreshRoot()
  } catch (e) {
    loadErr.value = translateOpcuaMessage(e.message || String(e))
  }
}

function onServerChange() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  msg.value = ''
  pickedNode.value = null
  prefetchGen.value += 1
  treeNodes.value = []
  bumpTree()
  searchHitEntries.value = []
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchRemoteLoading.value = false
  const q = searchTrimmed.value
  const runGen = ++searchRequestGen
  if (q) {
    searchDebounceTimer = window.setTimeout(() => void runPickModalVariableSearch(q, runGen), 120)
  }
  void refreshRoot()
}

async function refreshRoot() {
  prefetchGen.value += 1
  msg.value = ''
  const cap = browseCapability.value
  if (!cap) {
    msg.value = '请先选择一个已保存的 OPC UA 连接'
    treeNodes.value = []
    bumpTree()
    return
  }
  try {
    const res = await opcApiBrowse(null)
    if (res.ok === false) {
      msg.value = translateOpcuaMessage(res.message || '浏览失败')
      treeNodes.value = []
      bumpTree()
      return
    }
    const list = res.nodes || []
    treeNodes.value = list.map((n) => wrapOpcNode(n))
    bumpTree()
    void prefetchVariableValuesInNodes(treeNodes.value)
  } catch (e) {
    msg.value = translateOpcuaMessage(e.message || String(e))
  }
}

async function onToggleNode(node) {
  if (!browseCapability.value || !node.node_id || node.loading) return
  if (node.loaded) {
    node.expanded = !node.expanded
    bumpTree()
    return
  }
  node.loading = true
  node.errorMessage = null
  bumpTree()
  try {
    const res = await opcApiBrowse(node.node_id)
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
    if (v.length === 0) return '（空字符串）'
    return v.length > 72 ? `${v.slice(0, 69)}…` : v
  }
  return String(v)
}

const VARIABLE_PREFETCH_CONCURRENCY = 4

async function opcApiRead(nodeId) {
  const cap = browseCapability.value
  if (!cap || !nodeId) throw new Error('当前无法读取节点')
  return await apiFetch(`/opcua/read_saved/${cap.serverId}`, {
    method: 'POST',
    body: { node_id: nodeId },
  })
}

async function prefetchVariableValuesInNodes(nodes) {
  if (!browseCapability.value || !nodes?.length) return
  const myGen = prefetchGen.value
  const targets = nodes.filter((n) => n.node_id && isOpcVariableValueNode(n))
  for (let i = 0; i < targets.length; i += VARIABLE_PREFETCH_CONCURRENCY) {
    if (prefetchGen.value !== myGen || !browseCapability.value) return
    const batch = targets.slice(i, i + VARIABLE_PREFETCH_CONCURRENCY)
    await Promise.all(batch.map((node) => prefetchVariableTreeRow(node, myGen)))
  }
}

async function prefetchVariableTreeRow(node, myGen) {
  if (
    !browseCapability.value ||
    prefetchGen.value !== myGen ||
    !node?.node_id ||
    !isOpcVariableValueNode(node)
  )
    return
  try {
    const res = await opcApiRead(node.node_id)
    if (prefetchGen.value !== myGen || !browseCapability.value) return
    if (res.ok === false) {
      node.valuePreview = ''
      node.valueDataTypeLabel = ''
      node.valueReadError = res.message || '读值失败'
    } else {
      node.valueReadError = null
      node.valuePreview = formatOpcValuePreview(res)
      node.valueDataTypeLabel = opcDataTypeLabelFromRead(res)
    }
    bumpTree()
  } catch (e) {
    if (prefetchGen.value !== myGen || !browseCapability.value) return
    node.valuePreview = ''
    node.valueDataTypeLabel = ''
    node.valueReadError = e.message || String(e)
    bumpTree()
  }
}

function pickNode(n) {
  pickedNode.value = n
}

function confirmPick() {
  const id = pickedNode.value?.node_id
  if (!id) return
  emit('confirm', String(id))
  close()
}

function close() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  searchRequestGen++
  searchRemoteLoading.value = false
  emit('update:modelValue', false)
}

watch(searchTrimmed, (q) => {
  clearTimeout(searchDebounceTimer)
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchHitEntries.value = []
  searchRemoteLoading.value = false
  const runGen = ++searchRequestGen
  if (!q) return
  searchDebounceTimer = window.setTimeout(() => void runPickModalVariableSearch(q, runGen), 320)
})

watch(browseCapability, () => {
  clearTimeout(searchDebounceTimer)
  searchHitEntries.value = []
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchRemoteLoading.value = false
  const q = searchTrimmed.value
  const runGen = ++searchRequestGen
  if (!q) return
  searchDebounceTimer = window.setTimeout(() => void runPickModalVariableSearch(q, runGen), 120)
})

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      await loadServersWhenOpen()
      await nextTick()
      overlayRef.value?.focus()
    }
  },
)

onBeforeUnmount(() => {
  clearTimeout(searchDebounceTimer)
})
</script>

<style scoped>
.opc-pick-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgb(24 24 27 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.opc-pick-modal {
  width: min(920px, 100%);
  max-height: min(88vh, 900px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 24px 48px rgb(0 0 0 / 0.18);
  display: flex;
  flex-direction: column;
  min-height: 0;
  outline: none;
}
.opc-pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e4e4e7;
}
.opc-pick-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #18181b;
}
.opc-pick-close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #71717a;
  padding: 4px 8px;
  border-radius: 6px;
}
.opc-pick-close:hover {
  background: #f4f4f5;
  color: #18181b;
}
.opc-pick-lead {
  margin: 0;
  padding: 10px 16px;
  font-size: 12px;
  color: #52525b;
  line-height: 1.45;
}
.opc-pick-srv {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  padding: 0 16px 10px;
}
.opc-pick-srv-lbl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
  flex: 1;
  min-width: 200px;
}
.opc-pick-select {
  padding: 8px 10px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.opc-pick-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #d4d4d8;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  color: #374151;
}
.opc-pick-btn:hover:not(:disabled) {
  background: #fafafa;
}
.opc-pick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.opc-pick-btn.primary {
  background: #4f46e5;
  border-color: #4338ca;
  color: #fff;
}
.opc-pick-btn.primary:hover:not(:disabled) {
  background: #4338ca;
}
.opc-pick-warn {
  margin: 0 16px 8px;
  font-size: 12px;
  color: #b45309;
  line-height: 1.4;
}
.opc-pick-msg {
  margin: 0 16px 8px;
  font-size: 12px;
  color: #16a34a;
}
.opc-pick-msg-err {
  color: #b91c1c;
}
.opc-pick-search {
  padding: 0 16px 10px;
}
.opc-pick-search-lbl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #374151;
}
.opc-pick-search-inp {
  padding: 8px 10px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.opc-pick-search-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.45;
}
.opc-pick-search-empty {
  padding: 18px 8px;
  text-align: center;
  font-size: 12px;
  color: #71717a;
}
.opc-pick-search-status {
  padding: 18px 8px;
  text-align: center;
  font-size: 12px;
  color: #4338ca;
  font-weight: 600;
}
.opc-pick-search-meta {
  margin: 8px 8px 4px;
  font-size: 11px;
  color: #92400e;
  line-height: 1.4;
}
.opc-pick-hit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.opc-pick-hit-list li + li {
  margin-top: 4px;
}
.opc-pick-hit {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.opc-pick-hit:hover {
  border-color: #a5b4fc;
  background: #eef2ff;
}
.opc-pick-hit-path {
  color: #18181b;
  word-break: break-all;
}
.opc-pick-hit-id {
  color: #6366f1;
  font-size: 11px;
}
.opc-pick-tree {
  flex: 1;
  min-height: 220px;
  max-height: 48vh;
  overflow: auto;
  margin: 0 16px;
  padding: 8px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
}
.opc-pick-foot {
  padding: 12px 16px 16px;
  border-top: 1px solid #e4e4e7;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opc-pick-preview {
  font-size: 12px;
  color: #4b5563;
  word-break: break-all;
  min-height: 1.4em;
}
.opc-pick-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
