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
          <h2 id="opc-pick-title">{{ title }}</h2>
          <button type="button" class="opc-pick-close" aria-label="关闭" @click="close">×</button>
        </header>
        <p class="opc-pick-lead">{{ lead }}</p>
        <div class="opc-pick-srv">
          <label class="opc-pick-srv-lbl">
            <span>连接</span>
            <select v-model="selectedServerId" class="opc-pick-select" @change="onServerChange">
              <option value="">— 请选择 —</option>
              <option v-for="s in servers" :key="s.id" :value="s.id">{{ labelServer(s) }}</option>
            </select>
          </label>
          <button type="button" class="opc-pick-btn" :disabled="serversLoading" @click="refreshServerList">
            刷新连接
          </button>
          <button type="button" class="opc-pick-btn" :disabled="!browseCapability || expandAllBusy" @click="refreshRoot">
            刷新根
          </button>
          <button
            type="button"
            class="opc-pick-btn"
            :disabled="!browseCapability || expandAllBusy || !!searchTrimmed"
            :title="searchTrimmed ? '搜索模式下请使用树浏览' : ''"
            @click="expandAllTree"
          >
            {{ expandAllBusy ? "展开中…" : "一键全部展开" }}
          </button>
          <button
            type="button"
            class="opc-pick-btn"
            :disabled="!browseCapability || expandAllBusy || !!searchTrimmed"
            :title="searchTrimmed ? '搜索模式下请使用树浏览' : ''"
            @click="collapseAllTree"
          >
            一键全部合并
          </button>
        </div>
        <p v-if="servers.length === 0 && !loadErr" class="opc-pick-warn">
          暂无已保存连接。请先到侧边或通过路由打开<strong>数据源</strong>，在 OPC UA 页保存 Endpoint。
        </p>
        <p v-if="loadErr" class="opc-pick-msg opc-pick-msg-err">{{ translateOpcuaMessage(loadErr) }}</p>
        <p v-else-if="msg" class="opc-pick-msg">{{ translateOpcuaMessage(msg) }}</p>
        <div v-if="!hideSearch" class="opc-pick-search">
          <label class="opc-pick-search-lbl">
            <span>搜索变量</span>
            <input
              v-model="searchQuery"
              type="search"
              class="opc-pick-search-inp"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <p class="opc-pick-search-hint">{{ searchHint }}</p>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import OpcUaTree from './OpcUaTree.vue'
import { translateOpcuaMessage } from './opcua-messages.js'
import { opcDataTypeLabelFromRead } from './opcua-value-meta.js'
import {
  applyOpcBrowseChildren,
  collapseOpcTreeNodes,
  isOpcObjectLikeBrowseNode,
  isOpcVariableValueNode,
  opcDataTypeLabelMatchesFilter,
  shouldShowOpcBrowseChild,
} from './opcua-tree-utils.js'

const EXPAND_ALL_MAX_BROWSE = 350
const EXPAND_ALL_MAX_DEPTH = 40

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 仅展示该数据类型的 Variable（如 String）；展开时隐藏其它类型变量 */
  dataTypeFilter: { type: String, default: '' },
  title: { type: String, default: '选择 OPC UA 节点' },
  lead: {
    type: String,
    default:
      '请选择已保存的连接，展开地址空间后点击节点，再按「确定绑定」。绑定后仍可在输入框中手工微调 NodeId。',
  },
  /** 打开时预选连接 */
  initialServerId: { type: String, default: '' },
  /** 父组件已加载的连接列表；API 暂不可用时作回退 */
  externalServers: { type: Array, default: () => [] },
  /** 为 true 时不显示全地址空间搜索（仅树浏览） */
  hideSearch: { type: Boolean, default: false },
  /** 为 false 时由父组件在校验通过后自行关闭弹窗 */
  closeOnConfirm: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const dataTypeFilter = computed(() => (props.dataTypeFilter || '').trim())

const searchPlaceholder = computed(() =>
  dataTypeFilter.value
    ? `显示名、BrowseName、NodeId…（仅 ${dataTypeFilter.value} 变量）`
    : '显示名、BrowseName、NodeId…（从 Objects 扫描全地址空间）',
)

const searchHint = computed(() =>
  dataTypeFilter.value
    ? `后台从 Objects 扫描，仅列出数据类型为 ${dataTypeFilter.value} 的变量。`
    : '后台从 Objects 广度优先扫描，匹配变量（Variable）；无需事先展开树。',
)

const servers = ref([])
const serversLoading = ref(false)
const selectedServerId = ref('')
const loadErr = ref('')
const msg = ref('')
const treeNodes = shallowRef([])
const treeRev = ref(0)
const pickedNode = ref(null)
const prefetchGen = ref(0)
const expandAllBusy = ref(false)
let expandAllGen = 0
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
    browseLeaf: false,
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
  const body = { query: q }
  if (dataTypeFilter.value) body.data_type = dataTypeFilter.value
  return await apiFetch(`/opcua/search_saved/${cap.serverId}`, {
    method: 'POST',
    body,
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

function normalizeServerRow(s) {
  if (!s || typeof s !== 'object') return null
  const id = String(s.id || '').trim()
  if (!id) return null
  return {
    id,
    name: s.name,
    endpoint_url: s.endpoint_url,
  }
}

function mergeServerLists(primary, fallback) {
  const out = []
  const seen = new Set()
  for (const raw of [...(primary || []), ...(fallback || [])]) {
    const row = normalizeServerRow(raw)
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

async function refreshServerList() {
  if (serversLoading.value) return
  await loadServersWhenOpen()
}

function applyPreferredServerSelection(prefs) {
  if (!servers.value.length) {
    selectedServerId.value = ''
    return
  }
  const explicit = (props.initialServerId || '').trim()
  const pid = pickPreferredOpcServerId(prefs, servers.value, explicit || null)
  selectedServerId.value = pid || servers.value[0].id
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
  treeNodes.value = []
  pickedNode.value = null
  prefetchGen.value += 1
  bumpTree()
  // 先用父组件已加载列表占位，避免 remount 同 tick 打开时连接下拉短暂为空
  const cached = mergeServerLists([], props.externalServers)
  if (cached.length) {
    servers.value = cached
    const explicitCached = (props.initialServerId || '').trim()
    selectedServerId.value =
      (explicitCached && cached.some((s) => s.id === explicitCached) ? explicitCached : null) ||
      cached[0].id
  } else {
    servers.value = []
    selectedServerId.value = ''
  }
  try {
    let prefs = {}
    try {
      prefs = await apiFetch('/settings/app_preferences')
    } catch {
      prefs = {}
    }
    serversLoading.value = true
    const data = await apiFetch('/opcua/servers')
    servers.value = mergeServerLists(data.servers, props.externalServers)
    if (!servers.value.length) {
      return
    }
    applyPreferredServerSelection(prefs)
    await refreshRoot()
  } catch (e) {
    const fallback = mergeServerLists([], props.externalServers)
    if (fallback.length) {
      servers.value = fallback
      applyPreferredServerSelection({})
      loadErr.value = ''
      await refreshRoot()
      return
    }
    loadErr.value = translateOpcuaMessage(e.message || String(e))
  } finally {
    serversLoading.value = false
  }
}

function cancelExpandAll() {
  expandAllGen += 1
  expandAllBusy.value = false
}

function onServerChange() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  cancelExpandAll()
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
  cancelExpandAll()
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
    let list = (res.nodes || []).map((n) => wrapOpcNode(n))
    if (dataTypeFilter.value) {
      list = await filterBrowseChildrenForDataType(list)
    }
    treeNodes.value = list
    bumpTree()
    if (!dataTypeFilter.value) {
      void prefetchVariableValuesInNodes(treeNodes.value)
    }
  } catch (e) {
    msg.value = translateOpcuaMessage(e.message || String(e))
  }
}

async function fetchAndApplyNodeChildren(node) {
  const res = await opcApiBrowse(node.node_id)
  if (res.ok === false) {
    node.errorMessage = res.message || '浏览失败'
    applyOpcBrowseChildren(node, [])
    return []
  }
  let list = (res.nodes || []).map((n) => wrapOpcNode(n))
  if (dataTypeFilter.value) {
    list = await filterBrowseChildrenForDataType(list)
  }
  applyOpcBrowseChildren(node, list)
  if (list.length && !dataTypeFilter.value) {
    void prefetchVariableValuesInNodes(node.children)
  }
  return list
}

async function onToggleNode(node) {
  if (!browseCapability.value || !node.node_id || node.loading || expandAllBusy.value) return
  if (node.loaded) {
    node.expanded = !node.expanded
    bumpTree()
    return
  }
  node.loading = true
  node.errorMessage = null
  bumpTree()
  try {
    await fetchAndApplyNodeChildren(node)
  } catch (e) {
    node.errorMessage = e.message || String(e)
    msg.value = node.errorMessage
    applyOpcBrowseChildren(node, [])
  } finally {
    node.loading = false
    bumpTree()
  }
}

function enqueueExpandAllChildren(node, depth, queue) {
  if (!node.expanded || depth >= EXPAND_ALL_MAX_DEPTH) return
  for (const ch of node.children || []) {
    if (ch.browseLeaf) continue
    if (ch.loaded) {
      if ((ch.children?.length ?? 0) > 0) queue.push({ node: ch, depth: depth + 1 })
    } else if (isOpcObjectLikeBrowseNode(ch)) {
      queue.push({ node: ch, depth: depth + 1 })
    }
  }
}

function collapseAllTree() {
  if (!browseCapability.value || expandAllBusy.value || searchTrimmed.value) return
  cancelExpandAll()
  if (!treeNodes.value.length) {
    msg.value = '请先点击「刷新根」加载地址空间'
    return
  }
  collapseOpcTreeNodes(treeNodes.value)
  msg.value = '已全部合并'
  bumpTree()
}

async function expandAllTree() {
  if (!browseCapability.value || expandAllBusy.value || searchTrimmed.value) return
  if (!treeNodes.value.length) {
    msg.value = '请先点击「刷新根」加载地址空间'
    return
  }
  const myGen = ++expandAllGen
  expandAllBusy.value = true
  let browsed = 0
  msg.value = '正在一键展开…'
  try {
    const queue = []
    for (const n of treeNodes.value) {
      if (n.browseLeaf) continue
      if (n.loaded && (n.children?.length ?? 0) > 0) {
        n.expanded = true
        enqueueExpandAllChildren(n, 0, queue)
      } else if (isOpcObjectLikeBrowseNode(n)) {
        queue.push({ node: n, depth: 0 })
      }
    }
    bumpTree()

    while (queue.length && browsed < EXPAND_ALL_MAX_BROWSE) {
      if (myGen !== expandAllGen) return
      const { node, depth } = queue.shift()
      if (node.browseLeaf || depth > EXPAND_ALL_MAX_DEPTH) continue

      if (!node.loaded) {
        if (!isOpcObjectLikeBrowseNode(node)) continue
        browsed += 1
        node.loading = true
        bumpTree()
        try {
          await fetchAndApplyNodeChildren(node)
        } catch (e) {
          node.errorMessage = e.message || String(e)
          applyOpcBrowseChildren(node, [])
        } finally {
          node.loading = false
        }
        if (myGen !== expandAllGen) return
        msg.value = `正在展开…（已浏览 ${browsed} 个节点）`
        bumpTree()
      } else if ((node.children?.length ?? 0) > 0) {
        node.expanded = true
        bumpTree()
      }

      enqueueExpandAllChildren(node, depth, queue)
    }

    if (myGen !== expandAllGen) return
    if (browsed >= EXPAND_ALL_MAX_BROWSE && queue.length > 0) {
      msg.value = `已浏览 ${browsed} 个节点（已达上限，其余请手动展开）`
    } else {
      msg.value = '已全部展开'
    }
  } catch (e) {
    if (myGen === expandAllGen) {
      msg.value = translateOpcuaMessage(e.message || String(e))
    }
  } finally {
    if (myGen === expandAllGen) {
      expandAllBusy.value = false
      bumpTree()
    }
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

async function filterBrowseChildrenForDataType(children) {
  const filter = dataTypeFilter.value
  if (!filter || !children?.length) return children || []
  const myGen = prefetchGen.value
  const kept = []
  for (const n of children) {
    if (!isOpcVariableValueNode(n)) {
      kept.push(n)
      continue
    }
    await prefetchVariableTreeRow(n, myGen)
    if (prefetchGen.value !== myGen) return kept
    if (shouldShowOpcBrowseChild(n, filter)) kept.push(n)
  }
  bumpTree()
  return kept
}

async function pickNode(n) {
  if (dataTypeFilter.value && isOpcVariableValueNode(n)) {
    if (!n.valueDataTypeLabel) {
      await prefetchVariableTreeRow(n, prefetchGen.value)
    }
    const lbl = n.valueDataTypeLabel || ''
    if (!lbl) {
      msg.value = `无法识别节点数据类型，请换选其它节点`
      return
    }
    if (!opcDataTypeLabelMatchesFilter(lbl, dataTypeFilter.value)) {
      msg.value = `请选择数据类型为 ${dataTypeFilter.value} 的变量（当前：${lbl}）`
      return
    }
  }
  pickedNode.value = n
}

async function confirmPick() {
  const id = pickedNode.value?.node_id
  if (!id) return
  const filter = dataTypeFilter.value
  if (filter && isOpcVariableValueNode(pickedNode.value)) {
    if (!pickedNode.value.valueDataTypeLabel) {
      await prefetchVariableTreeRow(pickedNode.value, prefetchGen.value)
    }
    const lbl = pickedNode.value.valueDataTypeLabel || ''
    if (!lbl) {
      msg.value = '无法识别节点数据类型，请换选其它节点'
      return
    }
    if (!opcDataTypeLabelMatchesFilter(lbl, filter)) {
      msg.value = `当前节点类型为 ${lbl}，需要 ${filter}`
      return
    }
  }
  const sid = (selectedServerId.value || '').trim()
  const n = pickedNode.value
  const nodeLabel =
    String(n?.display_name || n?.browse_name || '')
      .trim()
  emit('confirm', { serverId: sid, nodeId: String(id), nodeLabel })
  if (props.closeOnConfirm !== false) close()
}

function close() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = null
  cancelExpandAll()
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
  { immediate: true },
)

watch(
  () => props.externalServers,
  (ext) => {
    if (!props.modelValue) return
    const merged = mergeServerLists(servers.value, ext)
    if (!merged.length) return
    const prevId = selectedServerId.value
    servers.value = merged
    if (!prevId || !merged.some((s) => s.id === prevId)) {
      const explicit = (props.initialServerId || '').trim()
      selectedServerId.value =
        (explicit && merged.some((s) => s.id === explicit) ? explicit : null) || merged[0].id
    }
  },
  { deep: true },
)

function onOpcServersChanged() {
  if (props.modelValue) void loadServersWhenOpen()
}

onMounted(() => {
  window.addEventListener('report-editor-opcua-servers-changed', onOpcServersChanged)
})

onBeforeUnmount(() => {
  clearTimeout(searchDebounceTimer)
  window.removeEventListener('report-editor-opcua-servers-changed', onOpcServersChanged)
})

watch(dataTypeFilter, async (filter, prev) => {
  if (!props.modelValue || filter === prev) return
  if (!browseCapability.value) return
  cancelExpandAll()
  pickedNode.value = null
  prefetchGen.value += 1
  if (treeNodes.value.length) {
    await refreshRoot()
  }
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
