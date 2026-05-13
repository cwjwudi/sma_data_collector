<template>
  <div class="qe">
    <div class="qe-editor">
      <div class="tabs">
        <button type="button" :class="{ on: mode === 'sql' }" @click="mode = 'sql'" :disabled="engine === 'mongodb'">SQL</button>
        <button type="button" :class="{ on: mode === 'mongo' }" @click="mode = 'mongo'" :disabled="engine !== 'mongodb'">
          Mongo aggregate
        </button>
      </div>
      <QuickQueryPanel
        :connection-id="connectionId"
        :engine="engine"
        :database="database"
        :active-table="activeTable"
        :active-collection="collection"
        :active-table-kind="activeTableKind"
        @fill-sql="onFillSql"
        @fill-mongo="onFillMongo"
      />
      <textarea v-if="mode === 'sql'" v-model="sqlText" class="ta" rows="8" placeholder="仅 SELECT / SHOW / EXPLAIN 等只读语句" />
      <textarea v-else v-model="mongoPipeline" class="ta" rows="8" placeholder='聚合管道 JSON，如 [{"$match":{}},{"$limit":10}]' />
      <div class="actions">
        <button type="button" class="btn primary sm" @click="run">运行</button>
        <button type="button" class="btn sm" @click="favorite">收藏当前</button>
      </div>
      <div class="hist">
        <div class="title">历史</div>
        <ul>
          <li v-for="(h, i) in history" :key="i" @click="loadHist(h)">{{ h.slice(0, 80) }}</li>
        </ul>
        <div class="title">收藏</div>
        <ul>
          <li v-for="(f, i) in favorites" :key="'f' + i" @click="loadHist(f)">{{ f.slice(0, 80) }}</li>
        </ul>
      </div>
      <div v-if="msg" class="msg">{{ msg }}</div>
    </div>
    <div class="qe-results">
      <div class="qe-results-title">查询结果</div>
      <div class="qe-results-grid">
        <DataGrid fill-height :columns="queryGridCols" :rows="queryGridRows" :status="queryGridStatus" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'
import QuickQueryPanel from './QuickQueryPanel.vue'
import DataGrid from '../data-grid/DataGrid.vue'

const props = defineProps({
  connectionId: { type: String, default: '' },
  engine: { type: String, default: '' },
  database: { type: String, default: '' },
  collection: { type: String, default: '' },
  activeTable: { type: String, default: '' },
  activeTableKind: { type: String, default: '' },
})

const mode = ref('sql')
const sqlText = ref('SELECT 1')
const mongoPipeline = ref('[{"$limit": 10}]')
const msg = ref('')
const history = ref([])
const favorites = ref([])

const queryGridCols = ref([])
const queryGridRows = ref([])
const queryGridStatus = ref('')

watch(
  () => props.engine,
  (e) => {
    mode.value = e === 'mongodb' ? 'mongo' : 'sql'
  },
  { immediate: true },
)

async function loadSessions() {
  try {
    const data = await apiFetch('/database/query_sessions')
    history.value = data.history || []
    favorites.value = data.favorites || []
  } catch {
    /* ignore */
  }
}

async function persistSessions() {
  try {
    await apiFetch('/database/query_sessions', {
      method: 'POST',
      body: { history: history.value, favorites: favorites.value },
    })
  } catch {
    /* ignore */
  }
}

watch(
  () => props.connectionId,
  () => {
    loadSessions()
    queryGridCols.value = []
    queryGridRows.value = []
    queryGridStatus.value = ''
    msg.value = ''
  },
  { immediate: true },
)

function loadHist(text) {
  if (text.trim().startsWith('[')) {
    mode.value = 'mongo'
    mongoPipeline.value = text
  } else {
    mode.value = 'sql'
    sqlText.value = text
  }
}

function onFillSql(sql) {
  mode.value = 'sql'
  sqlText.value = sql
}

function onFillMongo(text) {
  mode.value = 'mongo'
  mongoPipeline.value = text
}

async function run() {
  msg.value = ''
  if (!props.connectionId) {
    msg.value = '请选择连接'
    return
  }
  try {
    if (mode.value === 'sql') {
      const body = {
        connection_id: props.connectionId,
        sql: sqlText.value,
        limit: 500,
      }
      if (props.database && String(props.database).trim()) {
        body.database = props.database.trim()
      }
      const data = await apiFetch('/database/query/sql', {
        method: 'POST',
        body,
      })
      const n = Array.isArray(data.rows) ? data.rows.length : 0
      queryGridCols.value = data.columns || []
      queryGridRows.value = data.rows || []
      queryGridStatus.value = `查询完成：${n} 行`
      pushHist(sqlText.value)
    } else {
      if (!props.database || !props.collection) {
        msg.value = 'Mongo 查询需要先在对象树选择 database 与 collection'
        queryGridCols.value = []
        queryGridRows.value = []
        queryGridStatus.value = ''
        return
      }
      let pipe
      try {
        pipe = JSON.parse(mongoPipeline.value || '[]')
      } catch {
        msg.value = '聚合管道 JSON 无效'
        queryGridCols.value = []
        queryGridRows.value = []
        queryGridStatus.value = ''
        return
      }
      const data = await apiFetch('/database/query/mongo_aggregate', {
        method: 'POST',
        body: {
          connection_id: props.connectionId,
          database: props.database,
          collection: props.collection,
          pipeline: pipe,
          limit: 500,
        },
      })
      const n = Array.isArray(data.rows) ? data.rows.length : 0
      queryGridCols.value = data.columns || []
      queryGridRows.value = data.rows || []
      queryGridStatus.value = `查询完成：${n} 行`
      pushHist(mongoPipeline.value)
    }
    await persistSessions()
  } catch (e) {
    msg.value = e.message || String(e)
    queryGridCols.value = []
    queryGridRows.value = []
    queryGridStatus.value = ''
  }
}

function pushHist(line) {
  const trimmed = line.trim()
  if (!trimmed) return
  history.value = [trimmed, ...history.value.filter((x) => x !== trimmed)].slice(0, 100)
}

async function favorite() {
  const cur = mode.value === 'sql' ? sqlText.value.trim() : mongoPipeline.value.trim()
  if (!cur) return
  favorites.value = [cur, ...favorites.value.filter((x) => x !== cur)].slice(0, 50)
  await persistSessions()
}

function onSessionsExternalRefresh() {
  loadSessions()
}

onMounted(() => {
  window.addEventListener('report-editor-query-sessions-changed', onSessionsExternalRefresh)
})

onUnmounted(() => {
  window.removeEventListener('report-editor-query-sessions-changed', onSessionsExternalRefresh)
})
</script>

<style scoped>
.qe {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.qe-editor {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qe-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 160px;
}
.qe-results-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.qe-results-grid {
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tabs {
  display: flex;
  gap: 4px;
}
.tabs button {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}
.tabs button.on {
  background: #eef2ff;
  border-color: #6366f1;
}
.tabs button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.title {
  font-weight: 600;
  margin-bottom: 4px;
}
.btn {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.ta {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
}
.actions {
  display: flex;
  gap: 8px;
}
.hist {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  max-height: 180px;
  overflow: auto;
}
.hist ul {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
}
.hist li {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.hist li:hover {
  background: #f3f4f6;
}
.msg {
  color: #b91c1c;
  font-size: 12px;
}
</style>
