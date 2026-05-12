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
          <button :class="{ on: sub === 'er' }" type="button" @click="sub = 'er'">ER 图</button>
        </div>
        <div v-if="sub === 'data'" class="work-tab-grow data-tab-panel">
          <div class="preview-toolbar">
            <template v-if="activeEngine !== 'mongodb'">
              <span class="preview-toolbar-label">预览行数上限</span>
              <select v-model.number="previewSqlLimit" class="preview-limit-select" @change="previewTable">
                <option v-for="n in previewRowChoices" :key="n" :value="n">{{ n }}</option>
              </select>
              <button type="button" class="btn sm" @click="previewTable">按上限加载</button>
            </template>
            <template v-else>
              <span class="preview-toolbar-label">文档预览条数</span>
              <select v-model.number="mongoPreviewLimit" class="preview-limit-select" @change="previewMongo">
                <option v-for="n in previewRowChoices" :key="'m' + n" :value="n">{{ n }}</option>
              </select>
              <button type="button" class="btn sm" @click="previewMongo">按上限加载</button>
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
        <div v-else-if="sub === 'er'" class="work-tab-grow panel">
          <div class="row">
            <textarea v-model="schemaText" class="ta" rows="5" placeholder="粘贴 schema JSON 或 CREATE TABLE SQL" />
            <div class="col">
              <button type="button" class="btn sm" @click="parseSchema">解析文件内容</button>
              <label class="file">
                <input type="file" accept=".json,.sql,.txt" @change="onSchemaFile" />
                选择文件
              </label>
              <button type="button" class="btn sm" @click="mergeEr">与当前 catalog 合并</button>
            </div>
          </div>
          <ErDiagram :graph="erGraph" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import ConnectionManager from './connection-manager/ConnectionManager.vue'
import ObjectTree from './object-tree/ObjectTree.vue'
import DataGrid from './data-grid/DataGrid.vue'
import QueryEditor from './query-editor/QueryEditor.vue'
import RelationshipBrowser from './relationship-browser/RelationshipBrowser.vue'
import ErDiagram from './er-diagram/ErDiagram.vue'
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

const PREVIEW_ROW_CAP = 50000
/** 与后端 `/database/table/preview` clamp 一致 */
const previewRowChoices = [100, 500, 1000, 2000, 5000, 10000, 25000, 50000]

const previewSqlLimit = ref(100)
const mongoPreviewLimit = ref(100)

function formatPreviewStatus(loaded, requested, unit = '行') {
  const req = Math.min(PREVIEW_ROW_CAP, Math.max(1, requested || 100))
  let s = `已加载 ${loaded} ${unit}（本次请求上限 ${req}）`
  if (loaded >= req && req >= PREVIEW_ROW_CAP) {
    s += `；已达服务端预览上限 ${PREVIEW_ROW_CAP}`
  } else if (loaded >= req) {
    s += '；若仍少于表中总行数，可提高上限后点「按上限加载」'
  }
  return s
}

const ddlText = ref('')
const ddlLoading = ref(false)
const ddlError = ref('')
const lastDdlFetchKey = ref('')
const schemaText = ref('')
const erGraph = ref({ nodes: [], edges: [] })

const activeEngine = computed(() => connections.value.find((c) => c.id === activeConnId.value)?.engine || '')

const canDdl = computed(() => activeTable.value && activeEngine.value && activeEngine.value !== 'mongodb')

const activeTableKind = computed(() => catalog.value.tables?.find((t) => t.name === activeTable.value)?.kind || '')

async function reloadConnections(preferredId = null) {
  loadError.value = ''
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
    if (preferredId && connections.value.some((c) => c.id === preferredId)) {
      activeConnId.value = preferredId
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
  loadCatalog()
}

function onSelectConn(c) {
  activeConnId.value = c.id
  draftConn.value = c
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

async function previewTable() {
  gridStatus.value = '加载中…'
  try {
    const lim = Math.min(PREVIEW_ROW_CAP, Math.max(1, Math.floor(Number(previewSqlLimit.value) || 100)))
    previewSqlLimit.value = lim
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value || undefined,
      table: activeTable.value,
      limit: lim,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    gridCols.value = data.columns || []
    gridRows.value = data.rows || []
    gridStatus.value = formatPreviewStatus(gridRows.value.length, lim)
  } catch (e) {
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = e.message || String(e)
  }
}

async function previewMongo() {
  gridStatus.value = '加载中…'
  try {
    const lim = Math.min(PREVIEW_ROW_CAP, Math.max(1, Math.floor(Number(mongoPreviewLimit.value) || 100)))
    mongoPreviewLimit.value = lim
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value,
      table: activeCollection.value,
      limit: lim,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    gridCols.value = data.columns || []
    gridRows.value = data.rows || []
    gridStatus.value = formatPreviewStatus(gridRows.value.length, lim, '条')
  } catch (e) {
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = e.message || String(e)
  }
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

async function parseSchema() {
  try {
    const fmt = schemaText.value.trim().toUpperCase().startsWith('CREATE TABLE') ? 'sql' : 'json'
    const data = await apiFetch('/database/schema/parse', {
      method: 'POST',
      body: { format: fmt, content: schemaText.value },
    })
    erGraph.value = data.graph || { nodes: [], edges: [] }
  } catch (e) {
    gridStatus.value = e.message || String(e)
  }
}

function onSchemaFile(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    schemaText.value = String(reader.result || '')
  }
  reader.readAsText(file)
}

async function mergeEr() {
  try {
    const data = await apiFetch('/database/er/merge', {
      method: 'POST',
      body: {
        connection_id: activeConnId.value,
        database: activeDatabase.value || undefined,
        graph: erGraph.value,
      },
    })
    erGraph.value = data.graph || erGraph.value
  } catch (e) {
    gridStatus.value = e.message || String(e)
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
  min-height: 280px;
}
.work-tab-grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.data-tab-panel {
  gap: 8px;
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
.preview-limit-select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
}
.subtabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
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
