<template>
  <div class="opcua ds-scope" :class="{ 'opcua-wizard': wizardLayout }">
    <p v-if="wizardLayout" class="opc-lead">
      填写现场 OPC UA 服务器的地址与账号，先<strong>测试连接</strong>，通过后可<strong>浏览</strong>设备变量并保存。
      若暂时没有现场服务器，可跳过此步，稍后在<strong>数据源配置</strong>中补充。
    </p>
    <div class="tabs-conn">
      <button type="button" class="tab tab-new" @click="startNew">+ 新建</button>
      <button
        v-for="s in servers"
        :key="'conn-tab-' + s.id"
        type="button"
        :class="['tab', 'tab--with-led', { on: selected?.id === s.id }]"
        @click="onOpcConnTabClick(s)"
      >
        <ConnectionTabLed
          :state="opcHealth[s.id] || 'unknown'"
          :tooltip="opcConnTabTooltip(s)"
        />
        <span class="tab-label">{{ opcServerShortLabel(s) }}</span>
      </button>
    </div>

    <div class="cols compact">
      <div class="form-pane conn-form-pane">
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
        <label for="opc-poll-interval">读值刷新间隔</label>
        <div class="poll-interval poll-interval--form">
          <input
            id="opc-poll-interval"
            v-model.number="pollIntervalSeconds"
            type="number"
            min="0.5"
            max="300"
            step="0.5"
            class="input input-tiny"
            :disabled="!browseCapability"
          />
          <span class="poll-hint">秒（开启持续刷新后，按此间隔更新地址空间可见变量与当前选中变量）</span>
        </div>
        <div class="node-read-bar">
          <button
            type="button"
            class="btn seg"
            :disabled="!browseCapability || !pickedNode?.node_id"
            @click="readValue"
          >
            重新读取
          </button>
          <button
            type="button"
            class="btn seg"
            :class="{ primary: pollEnabled }"
            :disabled="!browseCapability"
            :aria-pressed="pollEnabled"
            :title="
              pollEnabled
                ? '停止定时刷新地址空间可见变量与选中变量详情'
                : '按上方间隔刷新地址空间已展开可见的变量读数，并刷新当前选中变量'
            "
            @click="togglePollEnabled"
          >
            {{ pollEnabled ? '停止持续刷新' : '持续刷新' }}
          </button>
        </div>
        <p v-if="pollEnabled && !canPollCurrent" class="poll-warn poll-warn-inline">
          地址空间中已展开可见的变量会定时读值；选中<strong>变量</strong>节点时，左侧详情同步更新。
        </p>
        <div v-if="pickedDisplay" class="picked-summary">
          <div class="picked-summary-head">
            <span class="picked-summary-title">{{ pickedDisplay.title }}</span>
            <button type="button" class="btn seg" @click="copyNodeId">复制 NodeId</button>
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
          <button type="button" class="btn primary seg" @click="saveServer">保存</button>
          <button type="button" class="btn seg" @click="testDraft">
            {{ wizardLayout ? '测试连接' : '测试连接（当前表单）' }}
          </button>
          <button type="button" class="btn danger seg" v-if="form.id" @click="removeServer">删除</button>
        </div>
        <div v-if="msg" class="msg">{{ translateOpcuaMessage(msg) }}</div>
      </div>
      <div class="browse-pane ds-side-pane">
        <div class="browse-head ds-pane-head">
          <div class="browse-head-titles ds-pane-head-titles">
            <span class="browse-title-main ds-pane-title">地址空间</span>
            <span v-if="browseHeadSubtitle" class="browse-title-sub ds-pane-subtitle">{{ browseHeadSubtitle }}</span>
          </div>
          <div class="browse-head-actions ds-pane-head-actions">
            <button
              type="button"
              class="btn seg"
              :disabled="!browseCapability || expandAllBusy"
              :title="browseCapability ? '' : '请先填写主机与端口，或从上方选择已保存连接'"
              @click="refreshRoot"
            >
              刷新根
            </button>
            <button
              type="button"
              class="btn seg"
              :disabled="!browseCapability || expandAllBusy || !!searchTrimmed"
              :title="searchTrimmed ? '搜索模式下请使用树浏览' : '浏览并展开全部可见分支（可能对 PLC 造成负载）'"
              @click="confirmExpandAllTree"
            >
              {{ expandAllBusy ? '展开中…' : '一键展开' }}
            </button>
            <button
              type="button"
              class="btn seg"
              :disabled="!browseCapability || expandAllBusy || !!searchTrimmed"
              :title="searchTrimmed ? '搜索模式下请使用树浏览' : ''"
              @click="collapseAllTree"
            >
              一键收起
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
import { computed, defineExpose, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import ConnectionTabLed from '@/features/datasource/ConnectionTabLed.vue'
import {
  probeConnectionIds,
  probeOpcSavedConnection,
  summarizeConnectionHealth,
} from '@/features/datasource/connection-tab-health'
import {
  formatConnectionHealthTooltip,
  getOpcConnectionHealth,
  pruneOpcConnectionHealth,
  setOpcConnectionHealth,
} from '@/features/datasource/connection-health-detail'
import { setOpcHealthSummary } from '@/features/datasource/datasource-nav-health'
import { auditLog } from '@/lib/auditLog'
import OpcUaTree from './OpcUaTree.vue'
import { translateOpcuaMessage } from './opcua-messages.js'
import {
  buildOpcEndpointUrl,
  parseOpcEndpointUrl,
  opcServerShortLabel,
  DEFAULT_OPCUA_PORT,
} from './opcua-endpoint-url.js'
import '../datasource-ui.css'
import '../connection-tabs.css'
import '../connection-form-pane.css'
import { opcDataTypeLabelFromRead } from './opcua-value-meta.js'
import { applyOpcBrowseChildren, collapseOpcTreeNodes, isOpcVariableValueNode } from './opcua-tree-utils.js'
import { runOpcExpandAllTree } from './opcua-tree-expand-all.js'
import { parseOpcNodeId, opcNodeClassLabel } from './opcua-node-display.js'

const props = defineProps({
  /** 向导内：单列芯片 + 草稿浏览 + 与数据库向导一致的一体化版面 */
  wizardLayout: { type: Boolean, default: false },
})

const emit = defineEmits(['health-summary'])

const servers = ref([])
let loadServersToken = 0
const opcHealth = reactive({})
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

const expandAllBusy = ref(false)
let expandAllGen = 0

/** 定时读当前选中 Variable（轮询）；与 readEpoch 无关 */
const pollEnabled = ref(false)
const pollIntervalSeconds = ref(2)
let pollTimerId = null
let pollInFlight = false

/** 定时读左侧树上所有「已展开 subtree」中出现的 Variable（与 OpcUaTree 可视范围一致） */
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

function setOpcHealth(id, state, message = '') {
  if (!id) return
  opcHealth[id] = state
  setOpcConnectionHealth(id, state, message)
}

function opcConnTabTooltip(server) {
  const rec = getOpcConnectionHealth(server.id)
  return formatConnectionHealthTooltip(rec, opcServerShortLabel(server))
}

function pruneOpcHealth(validIds) {
  const keep = new Set(validIds)
  for (const k of Object.keys(opcHealth)) {
    if (!keep.has(k)) delete opcHealth[k]
  }
  pruneOpcConnectionHealth(validIds)
}

function hydrateOpcServersFromLocalConfig() {
  const loader = window.electronAPI?.getDataSourceStartupSnapshot
  if (typeof loader !== 'function' || servers.value.length) return false
  void loader()
    .then((snap) => {
      if (servers.value.length) return
      const list = Array.isArray(snap?.opcua_servers) ? snap.opcua_servers : []
      if (!list.length) return
      servers.value = list.map((s) => ({ ...s }))
      emit('health-summary', connectionHealthSummary.value)
      setOpcHealthSummary(connectionHealthSummary.value)
      const pid = pickPreferredOpcServerId(snap?.app_preferences || {}, servers.value, null)
      const selectedServer = servers.value.find((s) => s.id === pid) || servers.value[0]
      if (selectedServer) selectServer(selectedServer, false)
    })
    .catch(() => {})
  return true
}

function probeAllOpcConnections() {
  const ids = servers.value.map((s) => s.id).filter(Boolean)
  pruneOpcHealth(ids)
  void probeConnectionIds(ids, probeOpcSavedConnection, setOpcHealth, 'opcua')
}

const connectionHealthSummary = computed(() =>
  summarizeConnectionHealth(
    servers.value.map((s) => s.id).filter(Boolean),
    opcHealth,
  ),
)

watch(
  connectionHealthSummary,
  (s) => {
    if (!servers.value.length && s.total === 0) return
    emit('health-summary', s)
    setOpcHealthSummary(s)
  },
)

async function loadServers(explicitPreferred = null, opts = {}) {
  const attempt = opts.attempt ?? 0
  const token = opts.token ?? ++loadServersToken

  let prefs = {}
  try {
    prefs = await apiFetch('/settings/app_preferences')
  } catch {
    prefs = {}
  }
  try {
    const data = await apiFetch('/opcua/servers')
    if (token !== loadServersToken) return
    servers.value = data.servers || []
    probeAllOpcConnections()
    emit('health-summary', connectionHealthSummary.value)
    setOpcHealthSummary(connectionHealthSummary.value)
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
  } catch (e) {
    if (token !== loadServersToken) return
    if (attempt < 7) {
      const delayMs = Math.min(350 * 2 ** attempt, 3000)
      await new Promise((r) => window.setTimeout(r, delayMs))
      return loadServers(explicitPreferred, { attempt: attempt + 1, token })
    }
    msg.value = e.message || String(e)
  }
}

function onOpcConnTabClick(s) {
  selectServer(s)
  probeAllOpcConnections()
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
    notifyOpcServersChanged()
    void auditLog({
      action: 'opcua.connection_save',
      result: 'ok',
      summary: nm || ep,
      object_type: 'opcua_server',
      object_id: created?.id || undefined,
    })
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function removeServer() {
  if (!form.id) return
  const removedId = form.id
  await apiFetch(`/opcua/servers/${removedId}`, { method: 'DELETE' })
  delete opcHealth[removedId]
  await loadServers()
  startNew()
  notifyOpcServersChanged()
}

async function testDraft() {
  msg.value = ''
  try {
    if (form.id) {
      const res = await apiFetch(`/opcua/test_saved/${form.id}`, {
        method: 'POST',
        body: {},
      })
      setOpcHealth(form.id, res.ok ? 'ok' : 'fail', res.ok ? '' : res.message || '连接失败')
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
    if (form.id) setOpcHealth(form.id, 'fail', e.message || String(e))
    msg.value = e.message || String(e)
  }
}

function cancelExpandAll() {
  expandAllGen += 1
  expandAllBusy.value = false
}

async function fetchAndApplyNodeChildren(node) {
  const res = await opcApiBrowse(node.node_id)
  if (res.ok === false) {
    node.errorMessage = res.message || '浏览失败'
    applyOpcBrowseChildren(node, [])
    return
  }
  const list = (res.nodes || []).map((n) => wrapOpcNode(n))
  applyOpcBrowseChildren(node, list)
  if (list.length) {
    void prefetchVariableValuesInNodes(node.children)
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
  msg.value = '已全部收起'
  bumpTree()
}

function confirmExpandAllTree() {
  if (!browseCapability.value || expandAllBusy.value || searchTrimmed.value) return
  if (!treeNodes.value.length) {
    msg.value = '请先点击「刷新根」加载地址空间'
    return
  }
  const ok = window.confirm(
    '一键展开将浏览并展开地址空间中的大量节点，可能对 PLC / OPC 服务器造成较高负载。\n\n' +
      '请仅在安全、非生产环境下操作。\n\n' +
      '确认后将自动关闭「持续刷新」。是否继续？',
  )
  if (!ok) return
  pollEnabled.value = false
  void expandAllTree()
}

async function expandAllTree() {
  if (!browseCapability.value || expandAllBusy.value || searchTrimmed.value) return
  const myGen = ++expandAllGen
  expandAllBusy.value = true
  msg.value = '正在一键展开…'
  try {
    const result = await runOpcExpandAllTree({
      rootNodes: treeNodes.value,
      fetchChildren: fetchAndApplyNodeChildren,
      bumpTree,
      shouldAbort: () => myGen !== expandAllGen,
      onProgress: (text) => {
        if (myGen === expandAllGen) msg.value = text
      },
    })
    if (myGen !== expandAllGen) return
    if (result === 'capped') {
      msg.value = `已浏览较多节点（已达上限，其余请手动展开）`
    } else if (result === 'done') {
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

async function refreshRoot() {
  cancelExpandAll()
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

function togglePollEnabled() {
  if (!browseCapability.value) return
  pollEnabled.value = !pollEnabled.value
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
  if (!pollEnabled.value || !browseCapability.value || treeRowPollInFlight) return
  const targets = collectVisibleVariableNodes(treeNodes.value)
  if (!targets.length) return
  const myGen = prefetchGen.value
  treeRowPollInFlight = true
  try {
    for (let i = 0; i < targets.length; i += VARIABLE_PREFETCH_CONCURRENCY) {
      if (
        prefetchGen.value !== myGen ||
        !browseCapability.value ||
        !pollEnabled.value
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
  if (!pollEnabled.value || !browseCapability.value) return
  const ms = Math.round(clampPollSeconds(pollIntervalSeconds.value) * 1000)
  void pollVisibleTreeVariablesOnce()
  treeRowPollTimerId = window.setInterval(() => void pollVisibleTreeVariablesOnce(), ms)
}

function syncAllPollTimers() {
  syncPollTimer()
  syncTreeRowPollTimer()
}

watch(
  [pollEnabled, pollIntervalSeconds, browseCapability, () => pickedNode.value],
  () => {
    syncAllPollTimers()
  },
  { flush: 'post', immediate: true },
)

watch(pollIntervalSeconds, (v) => {
  const c = clampPollSeconds(v)
  if (c !== v) pollIntervalSeconds.value = c
})

function notifyOpcServersChanged() {
  window.dispatchEvent(new CustomEvent('report-editor-opcua-servers-changed'))
}

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
  hydrateOpcServersFromLocalConfig()
  void loadServers()
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onBeforeUnmount(() => {
  loadServersToken += 1
  cancelExpandAll()
  clearTimeout(searchDebounceTimer)
  clearPollTimer()
  clearTreeRowPollTimer()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})

defineExpose({
  probeAllConnections: probeAllOpcConnections,
  healthSummary: connectionHealthSummary,
  reloadServers: loadServers,
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
  /* 左侧连接表单宽度与数据库工作台 ConnectionManager 列一致 */
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
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
.form-pane {
  min-width: 260px;
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
  flex: 1;
  min-height: 0;
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
}
.opc-browse-search-inp {
  width: 100%;
  box-sizing: border-box;
}
.opc-browse-search-hint {
  margin: 8px 0 0;
}
.opc-browse-search-empty,
.opc-browse-search-status {
  padding: 14px 8px;
  text-align: center;
}
.opc-browse-search-meta {
  margin: 8px 8px 4px;
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
.poll-interval {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.poll-interval--form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.poll-interval--form .poll-hint {
  flex: 1 1 12rem;
  line-height: 1.4;
}
.poll-interval label {
  margin: 0;
}
.poll-hint {
  color: #6b7280;
  font-size: 11px;
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

.opcua-wizard .cols.compact {
  grid-template-columns: minmax(240px, min(300px, 36%)) minmax(0, 1fr);
  gap: 12px;
}

.opcua-wizard .conn-form-pane {
  min-width: 0;
  max-width: 100%;
}

.opcua-wizard .conn-form-pane .actions {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.opcua-wizard .conn-form-pane .actions .btn.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.opcua-wizard .node-read-bar {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.opcua-wizard .node-read-bar .btn.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
}

.opcua-wizard .poll-interval--form .poll-hint {
  flex-basis: 100%;
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
