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
          <button :class="{ on: sub === 'visual' }" type="button" @click="sub = 'visual'">可视化 JOIN</button>
          <button :class="{ on: sub === 'er' }" type="button" @click="sub = 'er'">ER 图</button>
        </div>
        <DataGrid v-if="sub === 'data'" :columns="gridCols" :rows="gridRows" :status="gridStatus" />
        <QueryEditor
          v-if="sub === 'query'"
          :connection-id="activeConnId"
          :engine="activeEngine"
          :database="activeDatabase"
          :collection="activeCollection"
          :active-table="activeTable"
          :active-table-kind="activeTableKind"
        />
        <div v-if="sub === 'ddl'" class="panel ddl-panel-wrap">
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
        <VisualQueryBuilder v-if="sub === 'visual'" :connection-id="activeConnId" :database="activeDatabase" />
        <div v-if="sub === 'er'" class="panel">
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
import VisualQueryBuilder from './visual-builder/VisualQueryBuilder.vue'
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
    if (catalog.value.collections?.length && sub.value === 'data') {
      activeCollection.value = catalog.value.collections[0]
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
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value || undefined,
      table: activeTable.value,
      limit: 100,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    gridCols.value = data.columns || []
    gridRows.value = data.rows || []
    gridStatus.value = `共 ${gridRows.value.length} 行（最多预览 100）`
  } catch (e) {
    gridCols.value = []
    gridRows.value = []
    gridStatus.value = e.message || String(e)
  }
}

async function previewMongo() {
  gridStatus.value = '加载中…'
  try {
    const body = {
      connection_id: activeConnId.value,
      database: activeDatabase.value,
      table: activeCollection.value,
      limit: 50,
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    gridCols.value = data.columns || []
    gridRows.value = data.rows || []
    gridStatus.value = `文档预览 ${gridRows.value.length} 条`
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
}
.main > * {
  min-height: 0;
}
.work {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  min-height: 420px;
  display: flex;
  flex-direction: column;
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
