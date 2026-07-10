<template>
  <div class="wb ds-scope">
    <div v-if="loadError" class="load-err">{{ loadError }}</div>
    <div class="tabs-conn">
      <button type="button" class="tab tab-new" @click="onNewConn">+ 新建</button>
      <button
        v-for="t in openTabs"
        :key="t.id"
        type="button"
        :class="['tab', 'tab--with-led', { on: t.id === activeConnId }]"
        @click="activateTab(t.id)"
      >
        <ConnectionTabLed
          :state="connHealth[t.id] || 'unknown'"
          :tooltip="dbConnTabTooltip(t)"
        />
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </div>
    <div class="main">
      <ConnectionManager
        :model-value="draftConn"
        :creating-new="creatingNew"
        :loading="connectionsLoading"
        :loading-message="connectionsLoadingMessage"
        @updated="onConnectionUpdated"
        @new="onNewConn"
        @connection-tested="onConnectionTested"
      />
      <ObjectTree
        v-if="activeConnId"
        :engine="activeEngine"
        :databases="catalog.databases"
        :tables="catalog.tables"
        :collections="catalog.collections"
        :active-database="activeDatabase"
        :active-table="activeTable"
        :active-collection="activeCollection"
        @select-database="onPickDatabase"
        @select-table="onPickTable"
        @select-collection="onPickCollection"
        @refresh-catalog="refreshCatalog"
      />
      <div class="work" v-if="activeConnId">
        <div class="subtabs seg-tabs">
          <button :class="{ on: sub === 'data' }" type="button" @click="sub = 'data'">数据</button>
          <button :class="{ on: sub === 'query' }" type="button" @click="sub = 'query'">查询</button>
          <button :class="{ on: sub === 'ddl' }" type="button" @click="sub = 'ddl'">DDL 预览</button>
          <button :class="{ on: sub === 'visual' }" type="button" @click="sub = 'visual'">关系浏览器</button>
          <button :class="{ on: sub === 'pivot' }" type="button" @click="sub = 'pivot'">透视</button>
        </div>
        <div v-if="sub === 'data'" class="work-tab-grow data-tab-panel">
          <div class="preview-toolbar">
            <template v-if="activeEngine !== 'mongodb'">
              <button type="button" class="btn sm" :disabled="previewPage <= 1 || !activeTable" @click="previewSqlPrev">
                上一页
              </button>
              <span class="preview-toolbar-label"
                >第 {{ previewPage }} 页 · 每页 {{ PAGE_SIZE }} 条<span v-if="previewTotal != null"> · 共 {{ previewTotal }} 条</span></span
              >
              <button type="button" class="btn sm" :disabled="!canPreviewSqlNext" @click="previewSqlNext">下一页</button>
              <button type="button" class="btn sm" @click="previewTable(true)">刷新本页</button>
            </template>
            <template v-else>
              <button type="button" class="btn sm" :disabled="previewPage <= 1 || !activeCollection" @click="previewMongoPrev">
                上一页
              </button>
              <span class="preview-toolbar-label"
                >第 {{ previewPage }} 页 · 每页 {{ PAGE_SIZE }} 条<span v-if="previewTotal != null"> · 共 {{ previewTotal }} 条</span></span
              >
              <button type="button" class="btn sm" :disabled="!canPreviewMongoNext" @click="previewMongoNext">下一页</button>
              <button type="button" class="btn sm" @click="previewMongo(true)">刷新本页</button>
            </template>
          </div>
          <DataGrid fill-height :columns="gridCols" :rows="gridRows" :status="gridStatus" />
        </div>
        <div v-else-if="sub === 'query'" class="work-tab-grow">
          <QueryEditor
            :connection-id="activeConnId"
            :engine="activeEngine"
            :database="activeDatabase"
            :collection="activeCollection"
            :active-table="activeTable"
            :active-table-kind="activeTableKind"
          />
        </div>
        <div v-else-if="sub === 'ddl'" class="work-tab-grow panel ddl-panel-wrap">
          <div class="ddl-toolbar-row">
            <button type="button" class="btn sm" @click="loadDdl(true)" :disabled="!canDdl || ddlLoading">
              刷新 DDL
            </button>
          </div>
          <DdlPreviewPanel
            :engine="activeEngine"
            :ddl-text="ddlText"
            :loading="ddlLoading"
            :error-message="ddlError"
            :can-preview="canDdl"
          />
        </div>
        <RelationshipBrowser
          v-else-if="sub === 'visual'"
          class="work-tab-grow"
          :connection-id="activeConnId"
          :database="activeDatabase"
          :engine="activeEngine"
          :tables="catalog.tables"
        />
        <SmartPivotPanel
          v-else-if="sub === 'pivot'"
          class="work-tab-grow pivot-panel"
          :connection-id="activeConnId"
          :database="activeDatabase"
          :engine="activeEngine"
          :table-name="sqlTableForPivot"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, defineExpose, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const emit = defineEmits(['health-summary'])
import { apiFetch } from '@/api/client.js'
import '../datasource-ui.css'
import '../connection-tabs.css'
import ConnectionTabLed from '@/features/datasource/ConnectionTabLed.vue'
import {
  probeConnectionIds,
  probeDatabaseConnection,
  summarizeConnectionHealth,
} from '@/features/datasource/connection-tab-health'
import {
  formatConnectionHealthTooltip,
  getDbConnectionHealth,
  pruneDbConnectionHealth,
  setDbConnectionHealth,
} from '@/features/datasource/connection-health-detail'
import { setDbHealthSummary, dbConnectionHealth } from '@/features/datasource/database-connection-health'
import {
  clearWorkbenchSession,
  deleteCatalogSnapshot,
  getCatalogSnapshot,
  getLastProbeAt,
  getWorkbenchSession,
  saveWorkbenchSession,
  setCatalogSnapshot,
  shouldRefreshProbe,
  touchProbeTime,
} from '@/features/datasource/datasource-workbench-cache'
import { connectionTabLabel } from './connection-tab-label.js'
import ConnectionManager from './connection-manager/ConnectionManager.vue'
import ObjectTree from './object-tree/ObjectTree.vue'
import DataGrid from './data-grid/DataGrid.vue'

const QueryEditor = defineAsyncComponent(() => import('./query-editor/QueryEditor.vue'))
const RelationshipBrowser = defineAsyncComponent(() => import('./relationship-browser/RelationshipBrowser.vue'))
const SmartPivotPanel = defineAsyncComponent(() => import('./smart-pivot/SmartPivotPanel.vue'))
const DdlPreviewPanel = defineAsyncComponent(() => import('./ddl-preview/DdlPreviewPanel.vue'))

const connections = ref([])
const activeConnId = ref('')
const draftConn = ref(null)
const loadError = ref('')
const connectionsLoading = ref(false)
const connectionsLoadingMessage = ref('正在加载已保存的连接…')
const creatingNew = ref(false)

const openTabs = ref([])

let reloadToken = 0
let catalogLoadToken = 0
let loadWatchTimer = null
const MAX_LOAD_ATTEMPTS = 8
const FOREGROUND_LOAD_TIMEOUT_MS = 1200

/** 各已保存连接标签的健康指示灯 */
const connHealth = reactive({})

const catalog = ref({ databases: [], tables: [], collections: [] })
const activeDatabase = ref('')
const activeTable = ref('')
const activeCollection = ref('')

const sub = ref('data')

const gridCols = ref([])
const gridRows = ref([])
const gridStatus = ref('')

/** 与后端 `/database/table/preview` 单次上限一致 */
const PAGE_SIZE = 1000
const previewPage = ref(1)
/** @type {import('vue').Ref<number|null>} */
const previewTotal = ref(null)

function formatPagedStatus(loaded, page, unitLabel = '条') {
  const start = (page - 1) * PAGE_SIZE + (loaded > 0 ? 1 : 0)
  const end = (page - 1) * PAGE_SIZE + loaded
  let s =
    loaded > 0 ? `第 ${page} 页，显示 ${start}–${end} ${unitLabel}` : `第 ${page} 页，本页无数据`
  if (previewTotal.value != null) {
    s += `（共 ${previewTotal.value} ${unitLabel}）`
  }
  return s
}

const canPreviewSqlNext = computed(() => {
  if (!activeTable.value) return false
  if (gridRows.value.length < PAGE_SIZE) return false
  if (previewTotal.value != null) {
    return previewPage.value * PAGE_SIZE < previewTotal.value
  }
  return true
})

const canPreviewMongoNext = computed(() => {
  if (!activeCollection.value) return false
  if (gridRows.value.length < PAGE_SIZE) return false
  if (previewTotal.value != null) {
    return previewPage.value * PAGE_SIZE < previewTotal.value
  }
  return true
})

const ddlText = ref('')
const ddlLoading = ref(false)
const ddlError = ref('')
const lastDdlFetchKey = ref('')

const activeEngine = computed(() => connections.value.find((c) => c.id === activeConnId.value)?.engine || '')

/** 透视 Tab：SQL 引擎用当前表名；Mongo 由子组件自行提示不可用 */
const sqlTableForPivot = computed(() =>
  activeEngine.value === 'mongodb' ? '' : activeTable.value,
)

const canDdl = computed(() => activeTable.value && activeEngine.value && activeEngine.value !== 'mongodb')

const activeTableKind = computed(() => catalog.value.tables?.find((t) => t.name === activeTable.value)?.kind || '')

function connectionIdsSignature(list) {
  return (list || [])
    .map((c) => c.id)
    .filter(Boolean)
    .sort()
    .join('|')
}

function applyCatalogSnapshot(snap) {
  if (!snap) return
  catalog.value = {
    databases: [...(snap.catalog.databases || [])],
    tables: normalizeCatalogTables(snap.catalog.tables || []),
    collections: [...(snap.catalog.collections || [])],
  }
  activeDatabase.value = snap.activeDatabase || ''
  activeTable.value = snap.activeTable || ''
  activeCollection.value = snap.activeCollection || ''
  gridCols.value = Array.isArray(snap.gridCols) ? [...snap.gridCols] : []
  gridRows.value = Array.isArray(snap.gridRows) ? [...snap.gridRows] : []
  gridStatus.value = snap.gridStatus || ''
  previewPage.value = snap.previewPage || 1
  previewTotal.value = snap.previewTotal ?? null
  if (snap.sub) sub.value = snap.sub
}

function captureCatalogSnapshot() {
  return {
    catalog: {
      databases: [...catalog.value.databases],
      tables: normalizeCatalogTables(catalog.value.tables),
      collections: [...catalog.value.collections],
    },
    activeDatabase: activeDatabase.value,
    activeTable: activeTable.value,
    activeCollection: activeCollection.value,
    gridCols: [...gridCols.value],
    gridRows: [...gridRows.value],
    gridStatus: gridStatus.value,
    previewPage: previewPage.value,
    previewTotal: previewTotal.value,
    sub: sub.value,
    cachedAt: Date.now(),
  }
}

function normalizeCatalogTables(tables) {
  return (tables || [])
    .map((t) => {
      if (typeof t === 'string') return { name: t, kind: 'table' }
      return {
        name: String(t?.name || '').trim(),
        kind: String(t?.kind || 'table'),
      }
    })
    .filter((t) => t.name)
}

function pickPreferredDatabase(conn, databases, current = '') {
  const list = (databases || []).filter(Boolean)
  if (!list.length) return ''
  const preferred = [current, conn?.database].find((d) => d && list.includes(d))
  if (preferred) return preferred
  const systemDbs = new Set(['information_schema', 'mysql', 'performance_schema', 'sys', 'template0', 'template1'])
  return list.find((d) => !systemDbs.has(String(d).toLowerCase())) || list[0]
}

function pickFirstCatalogTable(tables) {
  return normalizeCatalogTables(tables)[0]?.name || ''
}

async function apiFetchWithTimeout(path, options = {}, timeoutMs = FOREGROUND_LOAD_TIMEOUT_MS) {
  if (typeof AbortController === 'undefined' || timeoutMs <= 0) {
    return apiFetch(path, options)
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await apiFetch(path, { ...options, signal: controller.signal })
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('后端启动中，已转入后台加载')
    }
    throw e
  } finally {
    window.clearTimeout(timer)
  }
}

function persistWorkbenchSession() {
  const prev = getWorkbenchSession()
  const catalogsByConnId = { ...(prev?.catalogsByConnId || {}) }
  if (
    activeConnId.value &&
    (catalog.value.databases.length || catalog.value.tables.length || catalog.value.collections.length)
  ) {
    catalogsByConnId[activeConnId.value] = captureCatalogSnapshot()
  }
  saveWorkbenchSession({
    connections: connections.value.map((c) => ({ ...c })),
    activeConnId: activeConnId.value,
    creatingNew: creatingNew.value,
    connHealth: { ...connHealth },
    catalogsByConnId,
    lastProbeAt: getLastProbeAt(),
    connectionsFetchedAt: Date.now(),
  })
}

function hydrateFromSession() {
  const s = getWorkbenchSession()
  if (!s?.connections?.length) return false
  connections.value = s.connections.map((c) => ({ ...c }))
  openTabs.value = connections.value.map((c) => ({ id: c.id, label: connectionTabLabel(c) }))
  activeConnId.value =
    s.activeConnId && connections.value.some((c) => c.id === s.activeConnId)
      ? s.activeConnId
      : connections.value[0]?.id || ''
  creatingNew.value = Boolean(s.creatingNew)
  draftConn.value = creatingNew.value
    ? null
    : connections.value.find((c) => c.id === activeConnId.value) || null
  for (const [id, state] of Object.entries(s.connHealth || {})) {
    const st = state === 'ok' || state === 'fail' || state === 'checking' ? state : 'unknown'
    setConnHealth(
      id,
      st,
      st === 'fail' ? '连接失败（上次检测结果，可点击「测试连接」重新验证）' : '',
    )
  }
  const cat = getCatalogSnapshot(activeConnId.value)
  if (cat) applyCatalogSnapshot(cat)
  connectionsLoading.value = false
  emit('health-summary', connectionHealthSummary.value)
  setDbHealthSummary(connectionHealthSummary.value)
  return true
}

async function hydrateFromLocalConfig() {
  const loader = window.electronAPI?.getDataSourceStartupSnapshot
  if (typeof loader !== 'function' || connections.value.length) return false
  try {
    const snap = await loader()
    const list = Array.isArray(snap?.connections) ? snap.connections : []
    if (!list.length) return false
    connections.value = list.map((c) => ({ ...c }))
    openTabs.value = connections.value.map((c) => ({ id: c.id, label: connectionTabLabel(c) }))
    const pid = pickPreferredConnectionId(snap?.app_preferences || {}, connections.value, null)
    activeConnId.value = pid || connections.value[0]?.id || ''
    creatingNew.value = false
    draftConn.value = connections.value.find((c) => c.id === activeConnId.value) || null
    const cached = getCatalogSnapshot(activeConnId.value)
    if (cached) applyCatalogSnapshot(cached)
    connectionsLoading.value = false
    emit('health-summary', connectionHealthSummary.value)
    setDbHealthSummary(connectionHealthSummary.value)
    persistWorkbenchSession()
    return true
  } catch {
    return false
  }
}

function pickPreferredConnectionId(prefs, conns, explicitPreferred) {
  const list = conns || []
  if (explicitPreferred && list.some((c) => c.id === explicitPreferred)) {
    return explicitPreferred
  }
  if (!prefs || prefs.auto_select_last_connection === false) {
    return null
  }
  const def = prefs.default_connection_id
  if (def && list.some((c) => c.id === def)) {
    return def
  }
  const last = prefs.last_connection_id
  if (last && list.some((c) => c.id === last)) {
    return last
  }
  return null
}

function setConnHealth(id, state, message = '') {
  if (!id) return
  connHealth[id] = state
  setDbConnectionHealth(id, state, message)
}

function dbConnTabTooltip(tab) {
  const rec = getDbConnectionHealth(tab.id)
  return formatConnectionHealthTooltip(rec, tab.label || tab.id)
}

function pruneConnHealth(validIds) {
  const keep = new Set(validIds)
  for (const k of Object.keys(connHealth)) {
    if (!keep.has(k)) delete connHealth[k]
  }
  pruneDbConnectionHealth(validIds)
}

function probeAllDatabaseConnections(options = {}) {
  const force = options.force === true
  if (!force && !shouldRefreshProbe(getLastProbeAt())) return
  const ids = connections.value.map((c) => c.id).filter(Boolean)
  pruneConnHealth(ids)
  const active = activeConnId.value
  const rest = ids.filter((id) => id !== active)
  touchProbeTime()
  if (active) {
    void probeConnectionIds([active], probeDatabaseConnection, setConnHealth, 'database-active', {
      silent: true,
    })
  }
  if (rest.length) {
    window.setTimeout(() => {
      void probeConnectionIds(rest, probeDatabaseConnection, setConnHealth, 'database', { silent: true })
    }, 120)
  }
}

function onConnectionTested({ id, ok, message }) {
  if (id) setConnHealth(id, ok ? 'ok' : 'fail', ok ? '' : message || '连接失败')
}

const connectionHealthSummary = computed(() =>
  summarizeConnectionHealth(
    connections.value.map((c) => c.id).filter(Boolean),
    connHealth,
  ),
)

watch(
  connectionHealthSummary,
  (s) => {
    if (!connections.value.length && s.total === 0) return
    emit('health-summary', s)
    setDbHealthSummary(s)
  },
)

async function persistLastConnection(id) {
  if (!id) return
  try {
    await apiFetch('/settings/app_preferences', {
      method: 'PATCH',
      body: { last_connection_id: id },
    })
  } catch {
    /* ignore */
  }
}

async function reloadConnections(preferredId = null, opts = {}) {
  const attempt = opts.attempt ?? 0
  const token = opts.token ?? ++reloadToken
  const background = opts.background === true
  const force = opts.force === true
  const prevSig = connectionIdsSignature(connections.value)

  if (!background && attempt === 0 && !connections.value.length) {
    connectionsLoading.value = true
    connectionsLoadingMessage.value = '正在加载已保存的连接…'
    loadError.value = ''
  }

  try {
    const fetcher = background ? apiFetch : apiFetchWithTimeout
    const [prefs, data] = await Promise.all([
      fetcher('/settings/app_preferences').catch(() => ({})),
      fetcher('/database/connections'),
    ])
    if (token !== reloadToken) return

    const nextList = data.connections || []
    const nextSig = connectionIdsSignature(nextList)
    connectionsLoading.value = false

    if (background && !force && prevSig && prevSig === nextSig && connections.value.length) {
      connections.value = nextList.map((c) => ({ ...c }))
      openTabs.value = connections.value.map((c) => ({ id: c.id, label: connectionTabLabel(c) }))
      if (activeConnId.value) {
        draftConn.value = connections.value.find((c) => c.id === activeConnId.value) || draftConn.value
      }
      persistWorkbenchSession()
      return
    }

    connections.value = nextList
    openTabs.value = connections.value.map((c) => ({ id: c.id, label: connectionTabLabel(c) }))
    if (!connections.value.length) {
      creatingNew.value = true
      activeConnId.value = ''
      draftConn.value = null
      openTabs.value = []
      catalog.value = { databases: [], tables: [], collections: [] }
      emit('health-summary', connectionHealthSummary.value)
      setDbHealthSummary(connectionHealthSummary.value)
      persistWorkbenchSession()
      return
    }
    creatingNew.value = false
    const pid = pickPreferredConnectionId(prefs, connections.value, preferredId)
    if (pid) {
      activeConnId.value = pid
    } else if (!activeConnId.value || !connections.value.some((c) => c.id === activeConnId.value)) {
      activeConnId.value = connections.value[0].id
    }
    draftConn.value = connections.value.find((c) => c.id === activeConnId.value) || null

    const cached = !force ? getCatalogSnapshot(activeConnId.value) : null
    if (cached) {
      applyCatalogSnapshot(cached)
    } else if (force || !background) {
      void loadCatalog({ force: false })
    }

    if (force || shouldRefreshProbe(getLastProbeAt())) {
      probeAllDatabaseConnections({ force })
    }
    emit('health-summary', connectionHealthSummary.value)
    setDbHealthSummary(connectionHealthSummary.value)
    persistWorkbenchSession()
  } catch (e) {
    if (token !== reloadToken) return
    if (attempt === 0 && !connections.value.length) {
      connectionsLoading.value = true
      connectionsLoadingMessage.value = '后端启动中，已在后台加载已保存连接…'
    }
    if (attempt < MAX_LOAD_ATTEMPTS - 1) {
      let delayMs = Math.min(350 * 2 ** attempt, 3000)
      try {
        await apiFetchWithTimeout('/health', {}, 500)
        delayMs = Math.min(delayMs, 600)
      } catch {
        delayMs = Math.max(delayMs, 800)
      }
      await new Promise((r) => window.setTimeout(r, delayMs))
      return reloadConnections(preferredId, { attempt: attempt + 1, token, background, force })
    }
    connectionsLoading.value = false
    if (connections.value.length) return
    loadError.value =
      (e.message || String(e)) +
      '（请确认后端已启动：开发时在项目目录执行 uvicorn，Electron 会拉起 Python；浏览器需能访问 /api 代理到 127.0.0.1:8000）'
    openTabs.value = []
    activeConnId.value = ''
    draftConn.value = null
    catalog.value = { databases: [], tables: [], collections: [] }
  }
}

function onConnectionUpdated(preferredId) {
  creatingNew.value = false
  clearWorkbenchSession()
  void reloadConnections(preferredId, { force: true })
}

function activateTab(id) {
  creatingNew.value = false
  activeConnId.value = id
  draftConn.value = connections.value.find((c) => c.id === id) || null
  persistLastConnection(id)
  const cached = getCatalogSnapshot(id)
  if (cached) {
    applyCatalogSnapshot(cached)
  } else {
    void loadCatalog({ force: false })
  }
  persistWorkbenchSession()
}

function refreshCatalog() {
  void loadCatalog({ force: true })
}

function onNewConn() {
  creatingNew.value = true
  draftConn.value = null
  activeConnId.value = ''
}

async function loadCatalog(opts = {}) {
  const force = opts.force === true
  const id = activeConnId.value
  if (!id) return
  const token = ++catalogLoadToken

  if (!force) {
    const cached = getCatalogSnapshot(id)
    if (cached) {
      applyCatalogSnapshot(cached)
      return
    }
  }

  const hadContent =
    catalog.value.databases.length || catalog.value.tables.length || catalog.value.collections.length
  if (!force && hadContent) {
    gridStatus.value = '正在刷新架构…'
  } else if (!hadContent) {
    catalog.value = { databases: [], tables: [], collections: [] }
    activeDatabase.value = ''
    activeTable.value = ''
    activeCollection.value = ''
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = '正在加载架构…'
    previewPage.value = 1
    previewTotal.value = null
  }

  try {
    const conn = connections.value.find((c) => c.id === id)
    const engine = (conn?.engine || activeEngine.value || '').toLowerCase()
    const preferredDatabase = activeDatabase.value || conn?.database || ''

    let nextDatabases = []
    let nextTables = []
    let nextCollections = []

    if (engine === 'sqlite') {
      const cat = await apiFetch('/database/catalog', { method: 'POST', body: { connection_id: id } })
      if (token !== catalogLoadToken || id !== activeConnId.value) return
      nextTables = normalizeCatalogTables(cat.tables || [])
    } else if (engine === 'mongodb') {
      const listCat = await apiFetch('/database/catalog', { method: 'POST', body: { connection_id: id } })
      if (token !== catalogLoadToken || id !== activeConnId.value) return
      nextDatabases = listCat.databases || []
      const db = pickPreferredDatabase(conn, nextDatabases, preferredDatabase)
      if (db) {
        activeDatabase.value = db
        const dbCat = await apiFetch('/database/catalog', {
          method: 'POST',
          body: { connection_id: id, database: db },
        })
        if (token !== catalogLoadToken || id !== activeConnId.value) return
        nextDatabases = dbCat.databases?.length ? dbCat.databases : nextDatabases
        nextCollections = dbCat.collections || []
      }
    } else {
      // MySQL / MariaDB / PostgreSQL：先拉库列表，再拉当前库的表/视图。
      // 勿在首请求带 database——否则仅返回 tables，若为空则无法触发二次拉取，刷新会清空对象树。
      const listCat = await apiFetch('/database/catalog', { method: 'POST', body: { connection_id: id } })
      if (token !== catalogLoadToken || id !== activeConnId.value) return
      nextDatabases = listCat.databases || []
      const db = pickPreferredDatabase(conn, nextDatabases, preferredDatabase)
      if (db) {
        activeDatabase.value = db
        const dbCat = await apiFetch('/database/catalog', {
          method: 'POST',
          body: { connection_id: id, database: db },
        })
        if (token !== catalogLoadToken || id !== activeConnId.value) return
        nextDatabases = dbCat.databases?.length ? dbCat.databases : nextDatabases
        nextTables = normalizeCatalogTables(dbCat.tables || [])
      }
    }

    catalog.value.databases = nextDatabases
    catalog.value.tables = nextTables
    catalog.value.collections = nextCollections
    gridStatus.value = ''
    let shouldPreviewTable = false
    let shouldPreviewMongo = false
    if (
      catalog.value.tables?.length &&
      sub.value === 'data' &&
      !catalog.value.tables.some((t) => t.name === activeTable.value)
    ) {
      activeTable.value = pickFirstCatalogTable(catalog.value.tables)
      shouldPreviewTable = true
    } else if (
      catalog.value.collections?.length &&
      sub.value === 'data' &&
      activeEngine.value === 'mongodb' &&
      !catalog.value.collections.includes(activeCollection.value)
    ) {
      activeCollection.value = catalog.value.collections[0]
      shouldPreviewMongo = true
    }
    setCatalogSnapshot(id, captureCatalogSnapshot())
    persistWorkbenchSession()
    if (shouldPreviewTable) void previewTable()
    if (shouldPreviewMongo) void previewMongo()
  } catch (e) {
    gridStatus.value = e.message || String(e)
    deleteCatalogSnapshot(id)
    persistWorkbenchSession()
  }
}

async function onPickDatabase(d) {
  activeDatabase.value = d
  activeTable.value = ''
  activeCollection.value = ''
  const token = ++catalogLoadToken
  try {
    const cat = await apiFetch('/database/catalog', {
      method: 'POST',
      body: { connection_id: activeConnId.value, database: d },
    })
    if (token !== catalogLoadToken) return
    catalog.value.tables = normalizeCatalogTables(cat.tables || [])
    catalog.value.collections = cat.collections || []
    gridCols.value = []
    gridRows.value = []
    previewPage.value = 1
    previewTotal.value = null
    if (activeEngine.value === 'mongodb' && catalog.value.collections.length) {
      activeCollection.value = catalog.value.collections[0]
      setCatalogSnapshot(activeConnId.value, captureCatalogSnapshot())
      persistWorkbenchSession()
      await previewMongo()
    } else if (catalog.value.tables.length) {
      activeTable.value = pickFirstCatalogTable(catalog.value.tables)
      setCatalogSnapshot(activeConnId.value, captureCatalogSnapshot())
      persistWorkbenchSession()
      await previewTable()
    } else {
      setCatalogSnapshot(activeConnId.value, captureCatalogSnapshot())
      persistWorkbenchSession()
    }
  } catch (e) {
    gridStatus.value = e.message || String(e)
    deleteCatalogSnapshot(activeConnId.value)
  }
}

async function onPickTable(t) {
  activeTable.value = t
  await previewTable()
}

async function onPickCollection(c) {
  activeCollection.value = c
  await previewMongo()
}

async function previewTable(resetPage = true) {
  if (!activeConnId.value || !activeTable.value) return
  if (resetPage) {
    previewPage.value = 1
    previewTotal.value = null
  }
  gridStatus.value = '加载中…'
  try {
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value || undefined,
      table: activeTable.value,
      limit: PAGE_SIZE,
      offset: (previewPage.value - 1) * PAGE_SIZE,
      include_total: previewPage.value === 1,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    if (data.columns?.length) gridCols.value = data.columns
    gridRows.value = data.rows || []
    if (data.total != null) previewTotal.value = data.total
    gridStatus.value = formatPagedStatus(gridRows.value.length, previewPage.value, '行')
    setCatalogSnapshot(activeConnId.value, captureCatalogSnapshot())
    persistWorkbenchSession()
  } catch (e) {
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = e.message || String(e)
  }
}

function previewSqlPrev() {
  if (previewPage.value <= 1) return
  previewPage.value--
  previewTable(false)
}

function previewSqlNext() {
  previewPage.value++
  previewTable(false)
}

async function previewMongo(resetPage = true) {
  if (!activeConnId.value || !activeCollection.value) return
  if (resetPage) {
    previewPage.value = 1
    previewTotal.value = null
  }
  gridStatus.value = '加载中…'
  try {
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value,
      table: activeCollection.value,
      limit: PAGE_SIZE,
      offset: (previewPage.value - 1) * PAGE_SIZE,
      include_total: previewPage.value === 1,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    if (data.columns?.length) gridCols.value = data.columns
    gridRows.value = data.rows || []
    if (data.total != null) previewTotal.value = data.total
    gridStatus.value = formatPagedStatus(gridRows.value.length, previewPage.value, '条')
    setCatalogSnapshot(activeConnId.value, captureCatalogSnapshot())
    persistWorkbenchSession()
  } catch (e) {
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = e.message || String(e)
  }
}

function previewMongoPrev() {
  if (previewPage.value <= 1) return
  previewPage.value--
  previewMongo(false)
}

function previewMongoNext() {
  previewPage.value++
  previewMongo(false)
}

async function loadDdl(force = false) {
  if (!canDdl.value) {
    ddlText.value = ''
    ddlError.value = ''
    ddlLoading.value = false
    return
  }
  const key = `${activeConnId.value}|${activeDatabase.value}|${activeTable.value}`
  if (!force && lastDdlFetchKey.value === key && ddlText.value && !ddlError.value) return

  ddlLoading.value = true
  ddlError.value = ''
  try {
    const data = await apiFetch('/database/ddl', {
      method: 'POST',
      body: {
        connection_id: activeConnId.value,
        database: activeDatabase.value || undefined,
        table: activeTable.value,
      },
    })
    ddlText.value = data.ddl || ''
    lastDdlFetchKey.value = key
  } catch (e) {
    ddlError.value = e.message || String(e)
    ddlText.value = ''
    lastDdlFetchKey.value = ''
  } finally {
    ddlLoading.value = false
  }
}

watch(activeConnId, () => {
  ddlText.value = ''
  ddlError.value = ''
  lastDdlFetchKey.value = ''
})

watch(
  () => [sub.value, activeConnId.value, activeDatabase.value, activeTable.value, activeEngine.value],
  () => {
    if (sub.value !== 'ddl') return
    loadDdl(false)
  },
)

function onConfigImported() {
  clearWorkbenchSession()
  void reloadConnections(null, { force: true })
}

function onDatasourceChanged(ev) {
  const scope = ev?.detail?.scope
  if (!scope || scope === 'all' || scope === 'db') {
    void reloadConnections(null, { force: true, background: true })
  }
}

function startLoadWatch() {
  if (loadWatchTimer != null) return
  let ticks = 0
  loadWatchTimer = window.setInterval(() => {
    ticks += 1
    if (connections.value.length > 0 || ticks > 12) {
      window.clearInterval(loadWatchTimer)
      loadWatchTimer = null
      return
    }
    if (!connectionsLoading.value) {
      void reloadConnections(null)
    }
  }, 2500)
}

watch(
  () => dbConnectionHealth.value.total,
  (total) => {
    if (total > 0 && connections.value.length === 0 && !connectionsLoading.value) {
      void reloadConnections(null, { background: true })
    }
  },
)

const sessionHydrated = hydrateFromSession()

onMounted(() => {
  window.addEventListener('report-editor-config-imported', onConfigImported)
  window.addEventListener('report-editor-datasource-changed', onDatasourceChanged)
  if (sessionHydrated || connections.value.length) {
    void reloadConnections(null, { background: true })
  } else {
    void hydrateFromLocalConfig().then((localHydrated) => {
      if (localHydrated) {
        void reloadConnections(null, { background: true })
      } else {
        void reloadConnections(null)
        startLoadWatch()
      }
    })
  }
})

onDeactivated(() => {
  persistWorkbenchSession()
})

onUnmounted(() => {
  persistWorkbenchSession()
  reloadToken += 1
  if (loadWatchTimer != null) {
    window.clearInterval(loadWatchTimer)
    loadWatchTimer = null
  }
  window.removeEventListener('report-editor-config-imported', onConfigImported)
  window.removeEventListener('report-editor-datasource-changed', onDatasourceChanged)
})

defineExpose({
  probeAllConnections: probeAllDatabaseConnections,
  healthSummary: connectionHealthSummary,
  reloadConnections,
  connectionsLoading,
  connectionCount: computed(() => connections.value.length),
})
</script>

<style scoped>
.wb {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.load-err {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.45;
}
.main {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(300px, 400px) minmax(320px, 1fr);
  gap: 16px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.main > * {
  min-height: 0;
}
.work {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.work-tab-grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.data-tab-panel {
  gap: 8px;
  min-height: 0;
}
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.subtabs {
  margin-bottom: 12px;
  flex-shrink: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pre {
  background: #0b1020;
  color: #e5e7eb;
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 320px;
  overflow: auto;
}
.ta {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 8px;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file input {
  display: none;
}
.file {
  font-size: 12px;
  cursor: pointer;
  color: #2563eb;
}
.ddl-panel-wrap {
  flex: 1;
  min-height: 0;
}
.ddl-toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
