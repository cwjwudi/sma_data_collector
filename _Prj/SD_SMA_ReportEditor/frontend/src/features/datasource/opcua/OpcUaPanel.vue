<template>
  <div class="opcua" :class="{ 'opcua-wizard': wizardLayout }">
    <p v-if="wizardLayout" class="opc-lead">
      在同一页完成<strong>测试</strong>、<strong>保存</strong>与<strong>浏览地址空间</strong>。可先填 IP/端口 与账号后直接点<strong>刷新根</strong>做草稿浏览（无需先保存）；已保存的连接从上方标签切换。模板占位
      <code v-pre>{opc.NodeId}</code>
      会用到此处确认的 NodeId。若无现场服务器，可随时跳过向导此步或在「数据源」中补齐。
    </p>
    <div class="tabs-conn">
      <button type="button" class="tab tab-new" @click="startNew">+ 新建</button>
      <button
        v-for="s in servers"
        :key="'conn-tab-' + s.id"
        type="button"
        :class="['tab', { on: selected?.id === s.id }]"
        @click="selectServer(s)"
      >
        {{ opcServerShortLabel(s) }}
      </button>
    </div>

    <div class="cols compact">
      <div class="form-pane">
        <div v-if="!wizardLayout" class="row-head">
          <h4>OPC UA 连接</h4>
        </div>
        <label>名称</label>
        <input v-model="form.name" class="input" />
        <label>主机 / IP</label>
        <input v-model="form.host" class="input" placeholder="192.168.1.10" />
        <label>端口</label>
        <input
          v-model="form.portText"
          type="text"
          inputmode="numeric"
          class="input"
          placeholder="4840"
        />
        <label>用户名（可选）</label>
        <input v-model="form.username" class="input" />
        <label>密码（可选）</label>
        <input v-model="form.password" type="password" class="input" autocomplete="new-password" />
                        <div class="node-read-bar">
          <button
            type="button"
            class="btn sm"
            :disabled="!browseCapability || !pickedNode?.node_id"
            @click="readValue"
          >
            重新读取
          </button>
          <label class="poll-label poll-label-compact">
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
        <p v-if="pollEnabled && !canPollCurrent" class="poll-warn poll-warn-inline">
          持续刷新仅对<strong>变量</strong>节点有效；请先在右侧地址空间选中变量。
        </p>
        <div v-if="pickedDisplay" class="picked-summary">
          <div class="picked-summary-head">
            <span class="picked-summary-title">{{ pickedDisplay.title }}</span>
            <button type="button" class="btn sm" @click="copyNodeId">复制 NodeId</button>
          </div>
          <dl class="picked-dl">
            <div class="picked-row">
              <dt>节点类型</dt>
              <dd>{{ pickedDisplay.nodeType }}</dd>
            </div>
            <div v-if="pickedDisplay.ns" class="picked-row">
              <dt>命名空间 ns</dt>
              <dd>{{ pickedDisplay.ns }}</dd>
            </div>
            <div v-if="pickedDisplay.identifier" class="picked-row">
              <dt>标识 {{ pickedDisplay.idKind }}</dt>
              <dd class="mono">{{ pickedDisplay.identifier }}</dd>
            </div>
            <div v-if="pickedDisplay.dataType" class="picked-row">
              <dt>数据类型</dt>
              <dd>{{ pickedDisplay.dataType }}</dd>
            </div>
            <div v-if="pickedDisplay.valueText" class="picked-row">
              <dt>当前值</dt>
              <dd class="picked-value">{{ pickedDisplay.valueText }}</dd>
            </div>
            <div v-else-if="pickedDisplay.readError" class="picked-row">
              <dt>读值</dt>
              <dd class="picked-error">{{ translateOpcuaMessage(pickedDisplay.readError) }}</dd>
            </div>
          </dl>
          <p v-if="copyFeedback" class="copy-feedback">{{ copyFeedback }}</p>
        </div>
        <div class="actions">
          <button type="button" class="btn primary sm" @click="saveServer">保存</button>
          <button type="button" class="btn sm" @click="testDraft">测试连接（当前表单）</button>
          <button type="button" class="btn danger sm" v-if="form.id" @click="removeServer">删除</button>
        </div>
        <div v-if="msg" class="msg">{{ translateOpcuaMessage(msg) }}</div>
      </div>
      <div class="browse-pane">
        <div class="browse-head">
          <div class="browse-head-titles">
            <span class="browse-title-main">地址空间</span>
            <span v-if="browseHeadSubtitle" class="browse-title-sub">{{ browseHeadSubtitle }}</span>
          </div>
          <div class="browse-head-actions">
            <label class="tree-poll-label" :title="'仅轮询已在左侧展开 subtree 中出现的 Variable（与 OpcUaTree 可视范围一致）'">
              <input v-model="treeRowPollEnabled" type="checkbox" class="tree-poll-checkbox" />
              <span class="tree-poll-text">树上读值定时刷新</span>
            </label>
            <span v-if="treeRowPollEnabled" class="tree-poll-interval">
              <label for="opc-tree-row-poll-interval">间隔</label>
              <input
                id="opc-tree-row-poll-interval"
                v-model.number="treeRowPollIntervalSeconds"
                type="number"
                min="0.5"
                max="300"
                step="0.5"
                class="input input-tiny"
              />
              <span class="poll-hint">秒</span>
            </span>
            <button
              type="button"
              class="btn sm"
              :disabled="!browseCapability"
              :title="browseCapability ? '' : '请先填写主机与端口，或从上方选择已保存连接'"
              @click="refreshRoot"
            >
              刷新根
            </button>
          </div>
        </div>
        <div class="browse-body" :class="{ 'browse-body-wizard': wizardLayout }">
          <div class="tree-wrap">
            <div class="opc-browse-search">
              <label class="opc-browse-search-lbl">
                <span>搜索变量</span>
                <input
                  v-model="searchQuery"
                  type="search"
                  class="opc-browse-search-inp"
                  placeholder="显示名、BrowseName、NodeId…（从 Objects 扫描全地址空间）"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <p class="opc-browse-search-hint">
                在后台从 <strong>Objects</strong> 起广度优先扫描 OPC UA 地址空间，匹配<strong>变量（Variable）</strong>的显示名、BrowseName 或
                NodeId 子串；<strong>无需事先展开左侧树</strong>。节点特别多时可能截断扫描，请缩小关键字。
              </p>
            </div>
            <template v-if="searchTrimmed">
              <div v-if="searchRemoteLoading" class="opc-browse-search-status">正在搜索地址空间…</div>
              <div v-else-if="searchRemoteError" class="opc-browse-search-empty">
                {{ translateOpcuaMessage(searchRemoteError) }}
              </div>
              <div v-else-if="!searchHitEntries.length" class="opc-browse-search-empty">
                无匹配的变量节点，请更换或缩短关键字。
              </div>
              <template v-else>
                <ul class="opc-browse-hit-list" role="listbox">
                  <li
                    v-for="(hit, idx) in searchHitEntries"
                    :key="'pb-' + idx + '-' + (hit.node.node_id || idx)"
                  >
                    <button type="button" class="opc-browse-hit" @click="pickNode(hit.node)">
                      <span class="opc-browse-hit-path">{{ hit.pathStr }}</span>
                      <span class="opc-browse-hit-id mono">{{ hit.node.node_id }}</span>
                    </button>
                  </li>
                </ul>
                <p v-if="searchRemoteInfo" class="opc-browse-search-meta">{{ searchRemoteInfo }}</p>
              </template>
            </template>
            <OpcUaTree
              v-else
              :nodes="treeNodes"
              :tree-rev="treeRev"
              @toggle="onToggleNode"
              @pick="pickNode"
            />
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
import { translateOpcuaMessage } from './opcua-messages.js'
import {
  buildOpcEndpointUrl,
  parseOpcEndpointUrl,
  opcServerShortLabel,
  DEFAULT_OPCUA_PORT,
} from './opcua-endpoint-url.js'
import '../connection-tabs.css'
import { opcDataTypeLabelFromRead } from './opcua-value-meta.js'
import { applyOpcBrowseChildren, isOpcVariableValueNode } from './opcua-tree-utils.js'
import { parseOpcNodeId, opcNodeClassLabel } from './opcua-node-display.js'

const props = defineProps({
  /** 向导内：单列芯片 + 草稿浏览 + 与数据库向导一致的一体化版面 */
  wizardLayout: { type: Boolean, default: false },
})

const servers = ref([])
const selected = ref(null)
const form = reactive({
  id: '',
  name: '',
  host: '',
  portText: String(DEFAULT_OPCUA_PORT),
  /** 从已保存 URL 解析出的路径段（如 report-edi），不在表单展示但保存时保留 */
  path: '',
  username: '',
  password: '',
})

function applyEndpointFieldsFromUrl(url) {
  const p = parseOpcEndpointUrl(url)
  form.host = p.host
  form.portText = p.portText
  form.path = p.path
}

function currentEndpointUrl() {
  return buildOpcEndpointUrl({
    host: form.host,
    portText: form.portText,
    path: form.path,
  })
}
const msg = ref('')
const searchQuery = ref('')
const treeNodes = shallowRef([])
const treeRev = ref(0)
const pickedNode = ref(null)
/** 左侧选中节点的可读读值摘要（非 JSON） */
const pickedValueText = ref('')
const pickedReadError = ref('')

const pickedDisplay = computed(() => {
  const n = pickedNode.value
  if (!n?.node_id) return null
  const parsed = parseOpcNodeId(n.node_id)
  const title = String(n.display_name || n.browse_name || '').trim() || '已选节点'
  return {
    title,
    nodeType: opcNodeClassLabel(n.node_class),
    ns: parsed.ns,
    identifier: parsed.identifier,
    idKind: parsed.idKind || 'i',
    dataType: String(n.valueDataTypeLabel || '').trim(),
    valueText: pickedValueText.value || (n.valuePreview ? String(n.valuePreview) : ''),
    readError: pickedReadError.value || n.valueReadError || '',
  }
})
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

/** 定时读左侧树上所有「已展开 subtree」中出现的 Variable（与 OpcUaTree 可视范围一致） */
const treeRowPollEnabled = ref(true)
const treeRowPollIntervalSeconds = ref(2)
let treeRowPollTimerId = null
let treeRowPollInFlight = false

const browseCapability = computed(() => {
  if (form.id) return { kind: 'saved', serverId: form.id }
  const ep = currentEndpointUrl()
  if (ep) {
    return {
      kind: 'ephemeral',
      endpoint_url: ep,
      username: (form.username || '').trim() || null,
      password: form.password || null,
    }
  }
  return null
})

const browseHeadSubtitle = computed(() => {
  const cap = browseCapability.value
  if (!cap) return ''
  return cap.kind === 'saved' ? '已保存连接 · 服务端池化' : '草稿 · 当前表单参数（可先不保存）'
})

const searchTrimmed = computed(() => (searchQuery.value || '').trim())

const searchHitEntries = ref([])
const searchRemoteLoading = ref(false)
const searchRemoteError = ref('')
const searchRemoteInfo = ref('')
let searchDebounceTimer = null
let searchRequestGen = 0

async function opcApiBrowse(parentNodeId) {
  const cap = browseCapability.value
  if (!cap) throw new Error('当前无法浏览')
  if (cap.kind === 'saved') {
    const body =
      parentNodeId != null && parentNodeId !== '' ? { node_id: parentNodeId } : {}
    return await apiFetch(`/opcua/browse_saved/${cap.serverId}`, { method: 'POST', body })
  }
  return await apiFetch('/opcua/browse', {
    method: 'POST',
    body: {
      endpoint_url: cap.endpoint_url,
      node_id: parentNodeId ?? null,
      username: cap.username,
      password: cap.password,
    },
  })
}

async function opcApiRead(nodeId) {
  const cap = browseCapability.value
  if (!cap || !nodeId) throw new Error('当前无法读取节点')
  if (cap.kind === 'saved') {
    return await apiFetch(`/opcua/read_saved/${cap.serverId}`, {
      method: 'POST',
      body: { node_id: nodeId },
    })
  }
  return await apiFetch('/opcua/read', {
    method: 'POST',
    body: {
      endpoint_url: cap.endpoint_url,
      node_id: nodeId,
      username: cap.username,
      password: cap.password,
    },
  })
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
  if (cap.kind === 'saved') {
    return await apiFetch(`/opcua/search_saved/${cap.serverId}`, {
      method: 'POST',
      body: { query: q },
    })
  }
  return await apiFetch('/opcua/search', {
    method: 'POST',
    body: {
      endpoint_url: cap.endpoint_url,
      username: cap.username,
      password: cap.password,
      query: q,
    },
  })
}

async function runAddressSpaceVariableSearch(q, runGen) {
  if (runGen !== searchRequestGen) return
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchHitEntries.value = []
  const cap = browseCapability.value
  if (!cap) {
    searchRemoteError.value = '请先保存 OPC UA 连接或填写主机与端口'
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
      searchRemoteInfo.value = `已扫描约 ${res.nodes_scanned ?? '—'} 个节点；范围或结果数量已达上限，请缩小关键字后重试。`
    }
  } catch (e) {
    if (runGen !== searchRequestGen) return
    searchRemoteLoading.value = false
    searchRemoteError.value = e.message || String(e)
  }
}

function rowForServerId(sid) {
  if (!sid) return null
  return servers.value.find((x) => x.id === sid) || null
}

/** 草稿阶段或表单暂未同步时仍需要 URL：优先表单，其次当前列表条目 */
function resolvedEndpointUrl(serverIdLike) {
  const built = currentEndpointUrl()
  if (built) return built
  const sid = serverIdLike || form.id
  const row = rowForServerId(sid)
  return String(row?.endpoint_url || '').trim()
}

async function copyNodeId() {
  const nid = pickedNode.value?.node_id
  if (!nid) return
  copyFeedback.value = ''
  try {
    await navigator.clipboard.writeText(String(nid))
    copyFeedback.value = 'NodeId 已复制'
    setTimeout(() => {
      copyFeedback.value = ''
    }, 2500)
  } catch (e) {
    msg.value = `复制失败：${translateOpcuaMessage(e.message || String(e))}`
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
  const row = (s && s.id && servers.value.find((x) => x.id === s.id)) || s
  selected.value = row
  form.id = row.id
  form.name = row.name || ''
  applyEndpointFieldsFromUrl(row.endpoint_url || '')
  form.username = row.username || ''
  form.password = ''
  msg.value = ''
  searchQuery.value = ''
  treeNodes.value = []
  pickedNode.value = null
  pickedValueText.value = ''
  pickedReadError.value = ''
  readEpoch.value += 1
  if (persist) {
    void persistLastOpcuaServer(row.id)
  }
  refreshRoot()
}

function startNew() {
  selected.value = null
  form.id = ''
  form.name = ''
  form.host = ''
  form.portText = String(DEFAULT_OPCUA_PORT)
  form.path = ''
  form.username = ''
  form.password = ''
  treeNodes.value = []
  searchQuery.value = ''
  pickedNode.value = null
  pickedValueText.value = ''
  pickedReadError.value = ''
  readEpoch.value += 1
}

function syncPickedPanelFromRead(node, res, errMsg) {
  if (pickedNode.value !== node) return
  if (errMsg) {
    pickedReadError.value = errMsg
    pickedValueText.value = ''
    return
  }
  if (res?.ok === false) {
    pickedReadError.value = res.message || '读值失败'
    pickedValueText.value = ''
    return
  }
  pickedReadError.value = ''
  pickedValueText.value = formatOpcValuePreview(res)
}

async function saveServer() {
  msg.value = ''
  try {
    let ep = currentEndpointUrl()
    const nmRaw = String(form.name || '').trim()
    let nm = nmRaw
    if (form.id) {
      const baseline = servers.value.find((x) => x.id === form.id)
      if (!ep) ep = String(baseline?.endpoint_url || '').trim()
      if (!nm) nm = String(baseline?.name || '').trim()
    }
    if (!ep) {
      msg.value = '请先填写主机与端口'
      return
    }
    const postRes = await apiFetch('/opcua/servers', {
      method: 'POST',
      body: {
        id: form.id || null,
        name: nm,
        endpoint_url: ep,
        username: form.username || null,
        password: form.password || null,
      },
    })
    const list = postRes.servers || []
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
    if (form.id) {
      const res = await apiFetch(`/opcua/test_saved/${form.id}`, {
        method: 'POST',
        body: {},
      })
      msg.value = res.ok ? '连接成功' : res.message || '失败'
      return
    }
    const ep = resolvedEndpointUrl()
    if (!ep) {
      msg.value = '请先填写主机与端口'
      return
    }
    const res = await apiFetch('/opcua/test', {
      method: 'POST',
      body: {
        endpoint_url: ep,
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
  prefetchGen.value += 1
  msg.value = ''
  const cap = browseCapability.value
  if (!cap) {
    if (props.wizardLayout) {
      msg.value =
        '请先填写主机与端口（可先不保存，直接刷新根预览），或通过上方选一个已保存连接。'
      treeNodes.value = []
      bumpTree()
    }
    return
  }
  try {
    const res = await opcApiBrowse(null)
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
      applyOpcBrowseChildren(node, [])
      return
    }
    const list = (res.nodes || []).map((n) => wrapOpcNode(n))
    applyOpcBrowseChildren(node, list)
    if (list.length) {
      void prefetchVariableValuesInNodes(node.children)
    }
  } catch (e) {
    node.errorMessage = e.message || String(e)
    msg.value = node.errorMessage
    applyOpcBrowseChildren(node, [])
  } finally {
    node.loading = false
    bumpTree()
  }
}

const canPollCurrent = computed(
  () =>
    !!(
      browseCapability.value &&
      pickedNode.value?.node_id &&
      isOpcVariableValueNode(pickedNode.value)
    ),
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
    if (v.length === 0) return '（空字符串）'
    return v.length > 72 ? `${v.slice(0, 69)}…` : v
  }
  return String(v)
}

/** 当前层级加载完成后，为所有 Variable 自动读值并填树行（无需逐节点点击） */
const VARIABLE_PREFETCH_CONCURRENCY = 4

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

/** 递归收集 OpcUaTree 当前会渲染的行中的 Variable（与 OpcUaTree buildRows 规则一致）。 */
function collectVisibleVariableNodes(nodes) {
  const acc = []
  function walk(list) {
    if (!list?.length) return
    for (const n of list) {
      if (n.node_id && isOpcVariableValueNode(n)) acc.push(n)
      const loaded = !!n.loaded
      const childCount = n.children?.length ?? 0
      if (n.expanded && loaded && childCount > 0) walk(n.children)
    }
  }
  walk(nodes)
  return acc
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
  pickedValueText.value = n?.valuePreview ? String(n.valuePreview) : ''
  pickedReadError.value = n?.valueReadError ? String(n.valueReadError) : ''
  readEpoch.value += 1
  const epoch = readEpoch.value
  if (browseCapability.value && n?.node_id && isOpcVariableValueNode(n)) {
    void fetchNodeValue(n, epoch)
  }
}

async function fetchNodeValue(node, epoch, { manual = false } = {}) {
  if (!browseCapability.value || !node?.node_id) return
  const showInTree = isOpcVariableValueNode(node)
  if (!manual && !showInTree) return

  const nodeId = node.node_id
  try {
    const res = await opcApiRead(nodeId)
    if (epoch !== readEpoch.value) return
    syncPickedPanelFromRead(node, res)
    if (showInTree) {
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
    }
  } catch (e) {
    if (epoch !== readEpoch.value) return
    syncPickedPanelFromRead(node, null, e.message || String(e))
    if (showInTree) {
      node.valuePreview = ''
      node.valueDataTypeLabel = ''
      node.valueReadError = e.message || String(e)
      bumpTree()
    }
  }
}

async function readValue() {
  if (!browseCapability.value || !pickedNode.value?.node_id) return
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

function clearTreeRowPollTimer() {
  if (treeRowPollTimerId != null) {
    clearInterval(treeRowPollTimerId)
    treeRowPollTimerId = null
  }
}

async function pollSelectedVariableOnce() {
  if (!pollEnabled.value || !browseCapability.value || pollInFlight) return
  const n = pickedNode.value
  if (!n?.node_id || !isOpcVariableValueNode(n)) return
  pollInFlight = true
  try {
    const res = await opcApiRead(n.node_id)
    if (!pollEnabled.value || pickedNode.value !== n || !browseCapability.value) return
    syncPickedPanelFromRead(n, res)
    if (res.ok === false) {
      n.valuePreview = ''
      n.valueDataTypeLabel = ''
      n.valueReadError = res.message || '读值失败'
    } else {
      n.valueReadError = null
      n.valuePreview = formatOpcValuePreview(res)
      n.valueDataTypeLabel = opcDataTypeLabelFromRead(res)
    }
    bumpTree()
  } catch (e) {
    if (!pollEnabled.value || pickedNode.value !== n) return
    syncPickedPanelFromRead(n, null, e.message || String(e))
    n.valuePreview = ''
    n.valueDataTypeLabel = ''
    n.valueReadError = e.message || String(e)
    bumpTree()
  } finally {
    pollInFlight = false
  }
}

function syncPollTimer() {
  clearPollTimer()
  if (!pollEnabled.value || !browseCapability.value) return
  const n = pickedNode.value
  if (!n?.node_id || !isOpcVariableValueNode(n)) return
  const ms = Math.round(clampPollSeconds(pollIntervalSeconds.value) * 1000)
  void pollSelectedVariableOnce()
  pollTimerId = window.setInterval(() => void pollSelectedVariableOnce(), ms)
}

async function pollVisibleTreeVariablesOnce() {
  if (!treeRowPollEnabled.value || !browseCapability.value || treeRowPollInFlight) return
  const targets = collectVisibleVariableNodes(treeNodes.value)
  if (!targets.length) return
  const myGen = prefetchGen.value
  treeRowPollInFlight = true
  try {
    for (let i = 0; i < targets.length; i += VARIABLE_PREFETCH_CONCURRENCY) {
      if (
        prefetchGen.value !== myGen ||
        !browseCapability.value ||
        !treeRowPollEnabled.value
      ) {
        return
      }
      const batch = targets.slice(i, i + VARIABLE_PREFETCH_CONCURRENCY)
      await Promise.all(batch.map((node) => prefetchVariableTreeRow(node, myGen)))
    }
  } finally {
    treeRowPollInFlight = false
  }
}

function syncTreeRowPollTimer() {
  clearTreeRowPollTimer()
  if (!treeRowPollEnabled.value || !browseCapability.value) return
  const ms = Math.round(clampPollSeconds(treeRowPollIntervalSeconds.value) * 1000)
  void pollVisibleTreeVariablesOnce()
  treeRowPollTimerId = window.setInterval(() => void pollVisibleTreeVariablesOnce(), ms)
}

watch(
  [pollEnabled, pollIntervalSeconds, browseCapability, () => pickedNode.value],
  () => {
    syncPollTimer()
  },
  { flush: 'post' },
)

watch(pollIntervalSeconds, (v) => {
  const c = clampPollSeconds(v)
  if (c !== v) pollIntervalSeconds.value = c
})

watch(
  [treeRowPollEnabled, treeRowPollIntervalSeconds, browseCapability],
  () => {
    syncTreeRowPollTimer()
  },
  { flush: 'post', immediate: true },
)

watch(treeRowPollIntervalSeconds, (v) => {
  const c = clampPollSeconds(v)
  if (c !== v) treeRowPollIntervalSeconds.value = c
})

function onConfigImported() {
  void loadServers()
}

watch(searchTrimmed, (q) => {
  clearTimeout(searchDebounceTimer)
  searchRemoteError.value = ''
  searchRemoteInfo.value = ''
  searchHitEntries.value = []
  searchRemoteLoading.value = false
  const runGen = ++searchRequestGen
  if (!q) return
  searchDebounceTimer = window.setTimeout(() => void runAddressSpaceVariableSearch(q, runGen), 320)
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
  searchDebounceTimer = window.setTimeout(() => void runAddressSpaceVariableSearch(q, runGen), 120)
})

onMounted(() => {
  void loadServers()
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onBeforeUnmount(() => {
  clearTimeout(searchDebounceTimer)
  clearPollTimer()
  clearTreeRowPollTimer()
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
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
@media (max-width: 900px) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
.form-pane,
.browse-pane {
  min-width: 0;
  min-height: 0;
}
.row-head {
  margin-bottom: 4px;
}
.row-head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.form-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.node-read-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}
.poll-label-compact {
  min-height: auto;
  padding: 0;
}
.poll-warn-inline {
  margin: 0;
  font-size: 11px;
}
.picked-summary {
  margin-top: 4px;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.picked-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.picked-summary-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 1.35;
}
.picked-dl {
  margin: 0;
}
.picked-row {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 6px 10px;
  font-size: 13px;
  padding: 4px 0;
}
.picked-row dt {
  margin: 0;
  color: #6b7280;
  font-weight: 500;
}
.picked-row dd {
  margin: 0;
  color: #111827;
  word-break: break-word;
}
.picked-value {
  font-weight: 600;
  color: #1d4ed8;
}
.picked-error {
  color: #b91c1c;
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
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
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
.opc-browse-search {
  padding: 4px 6px 10px;
}
.opc-browse-search-lbl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #374151;
}
.opc-browse-search-inp {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
  background: #fff;
}
.opc-browse-search-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
}
.opc-browse-search-empty {
  padding: 14px 8px;
  text-align: center;
  font-size: 12px;
  color: #6b7280;
}
.opc-browse-search-status {
  padding: 14px 8px;
  text-align: center;
  font-size: 12px;
  color: #4338ca;
  font-weight: 600;
}
.opc-browse-search-meta {
  margin: 8px 8px 4px;
  font-size: 11px;
  color: #92400e;
  line-height: 1.4;
}
.opc-browse-hit-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 8px;
}
.opc-browse-hit-list li + li {
  margin-top: 4px;
}
.opc-browse-hit {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  box-sizing: border-box;
}
.opc-browse-hit:hover {
  border-color: #a5b4fc;
  background: #eef2ff;
}
.opc-browse-hit-path {
  color: #111827;
  word-break: break-all;
}
.opc-browse-hit-id {
  color: #6366f1;
  font-size: 11px;
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
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.browse-head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px 12px;
  flex-shrink: 0;
}

.tree-poll-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: #374151;
  max-width: 100%;
}

.tree-poll-checkbox {
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  margin: 0;
  cursor: pointer;
  accent-color: #2563eb;
  flex-shrink: 0;
}

.tree-poll-text {
  white-space: nowrap;
}

.tree-poll-interval {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
}

.tree-poll-interval label {
  margin: 0;
}

.browse-head-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.browse-title-main {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.browse-title-sub {
  font-size: 11px;
  line-height: 1.35;
  color: #6b7280;
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

/* —— 向导一体化布局 —— */
.opcua-wizard .opc-lead {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.55;
  color: #64748b;
}

.opcua-wizard .browse-body-wizard {
  flex-direction: column;
}

.opcua-wizard .browse-body-wizard .tree-wrap {
  flex: 1;
  width: 100%;
  min-height: 200px;
}

</style>
