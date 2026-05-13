<template>
  <div class="wb">
    <div v-if="loadError" class="load-err">{{ loadError }}</div>
    <div class="tabs-conn">
      <button
        v-for="t in openTabs"
        :key="t.id"
        type="button"
        :class="['tab', { on: t.id === activeConnId }]"
        @click="activateTab(t.id)"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="main">
      <ConnectionManager
        :connections="connections"
        :active-id="activeConnId"
        :model-value="draftConn"
        @select="onSelectConn"
        @updated="reloadConnections"
        @new="onNewConn"
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
      />
      <div class="work" v-if="activeConnId">
        <div class="subtabs">
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import ConnectionManager from './connection-manager/ConnectionManager.vue'
import ObjectTree from './object-tree/ObjectTree.vue'
import DataGrid from './data-grid/DataGrid.vue'
import QueryEditor from './query-editor/QueryEditor.vue'
import RelationshipBrowser from './relationship-browser/RelationshipBrowser.vue'
import SmartPivotPanel from './smart-pivot/SmartPivotPanel.vue'
import DdlPreviewPanel from './ddl-preview/DdlPreviewPanel.vue'

const connections = ref([])
const activeConnId = ref('')
const draftConn = ref(null)
const loadError = ref('')

const openTabs = ref([])

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

async function reloadConnections(preferredId = null) {
  loadError.value = ''
  let prefs = {}
  try {
    prefs = await apiFetch('/settings/app_preferences')
  } catch {
    prefs = {}
  }
  try {
    const data = await apiFetch('/database/connections')
    connections.value = data.connections || []
    openTabs.value = connections.value.map((c) => ({ id: c.id, label: c.name || c.engine }))
    if (!connections.value.length) {
      activeConnId.value = ''
      draftConn.value = null
      openTabs.value = []
      catalog.value = { databases: [], tables: [], collections: [] }
      return
    }
    const pid = pickPreferredConnectionId(prefs, connections.value, preferredId)
    if (pid) {
      activeConnId.value = pid
    } else if (!activeConnId.value || !connections.value.some((c) => c.id === activeConnId.value)) {
      activeConnId.value = connections.value[0].id
    }
    draftConn.value = connections.value.find((c) => c.id === activeConnId.value) || null
    await loadCatalog()
  } catch (e) {
    loadError.value =
      (e.message || String(e)) +
      '（请确认后端已启动：开发时在项目目录执行 uvicorn，Electron 会拉起 Python；浏览器需能访问 /api 代理到 127.0.0.1:8000）'
    connections.value = []
    openTabs.value = []
    activeConnId.value = ''
    draftConn.value = null
    catalog.value = { databases: [], tables: [], collections: [] }
  }
}

function activateTab(id) {
  activeConnId.value = id
  draftConn.value = connections.value.find((c) => c.id === id) || null
  persistLastConnection(id)
  loadCatalog()
}

function onSelectConn(c) {
  activeConnId.value = c.id
  draftConn.value = c
  persistLastConnection(c.id)
  loadCatalog()
}

function onNewConn() {
  draftConn.value = null
  activeConnId.value = ''
}

async function loadCatalog() {
  catalog.value = { databases: [], tables: [], collections: [] }
  activeDatabase.value = ''
  activeTable.value = ''
  activeCollection.value = ''
  gridCols.value = []
  gridRows.value = []
  gridStatus.value = ''
  previewPage.value = 1
  previewTotal.value = null
  if (!activeConnId.value) return
  try {
    const conn = connections.value.find((c) => c.id === activeConnId.value)
    const payload = { connection_id: activeConnId.value }
    if (conn?.database && activeEngine.value !== 'mongodb') {
      payload.database = conn.database
      activeDatabase.value = conn.database
    }
    const cat = await apiFetch('/database/catalog', { method: 'POST', body: payload })
    catalog.value.databases = cat.databases || []
    catalog.value.tables = cat.tables || []
    catalog.value.collections = cat.collections || []
    if (catalog.value.tables?.length && sub.value === 'data') {
      activeTable.value = catalog.value.tables[0].name
      await previewTable()
    }
    if (catalog.value.collections?.length && sub.value === 'data' && activeEngine.value === 'mongodb') {
      activeCollection.value = catalog.value.collections[0]
      await previewMongo()
    }
  } catch (e) {
    gridStatus.value = e.message || String(e)
  }
}

async function onPickDatabase(d) {
  activeDatabase.value = d
  activeTable.value = ''
  activeCollection.value = ''
  try {
    const cat = await apiFetch('/database/catalog', {
      method: 'POST',
      body: { connection_id: activeConnId.value, database: d },
    })
    catalog.value.tables = cat.tables || []
    catalog.value.collections = cat.collections || []
    gridCols.value = []
    gridRows.value = []
    previewPage.value = 1
    previewTotal.value = null
  } catch (e) {
    gridStatus.value = e.message || String(e)
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
  reloadConnections(null)
}

onMounted(() => {
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onUnmounted(() => {
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})

reloadConnections()
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
.tabs-conn {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.tab.on {
  background: #eef2ff;
  border-color: #6366f1;
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
.preview-toolbar-label {
  font-size: 12px;
  color: #6b7280;
}
.subtabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.subtabs button {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.subtabs button.on {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.btn.sm {
  padding: 4px 8px;
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
