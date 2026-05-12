<template>
  <details class="qq-details" open>
    <summary class="qq-summary">快捷查询</summary>
    <div class="qq-body">
      <p class="qq-hint">
        {{
          isMongo
            ? '检索集合名，一键填充示例聚合管道（请在左侧对象树选中 database / collection 后再运行）。'
            : '检索表名，一键填充 SELECT；「列」加载字段后可填充部分列（替换编辑器全文）。'
        }}
      </p>
      <label class="qq-label" for="qq-filter">筛选</label>
      <input
        id="qq-filter"
        v-model="queryRaw"
        type="search"
        class="qq-search"
        placeholder="输入名称片段…"
        autocomplete="off"
        @input="onSearchInput"
      />

      <div v-if="!connectionId" class="qq-empty">未选择连接</div>

      <template v-else-if="isMongo">
        <div v-if="!rankedCollections.length" class="qq-empty">暂无集合或未匹配</div>
        <div v-else class="qq-scroll">
          <div v-for="name in rankedCollections" :key="'m-' + name" class="qq-row">
            <span class="qq-name" :class="{ hi: name === activeCollection }">{{ name }}</span>
            <button type="button" class="btn xs" @click="fillMongoPipeline(name)">填充 pipeline</button>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="!rankedTables.length" class="qq-empty">暂无表或未匹配</div>
        <div v-else class="qq-scroll">
          <div v-for="name in rankedTables" :key="'t-' + name" class="qq-row">
            <span class="qq-name" :class="{ hi: name === activeTable }">{{ name }}</span>
            <button type="button" class="btn xs" @click="fillSelectStar(name)">SELECT *</button>
            <button type="button" class="btn xs" @click="toggleColumns(name)">{{ detailTable === name ? '收起列' : '列' }}</button>
          </div>
        </div>

        <div v-if="detailTable && !isMongo" class="qq-detail">
          <div v-if="detailLoading" class="qq-muted">加载列…</div>
          <div v-else-if="detailErr" class="qq-err">{{ detailErr }}</div>
          <template v-else-if="detailCols.length">
            <div class="qq-chip-row">
              <span v-for="c in detailCols.slice(0, 16)" :key="c.name" class="chip" :title="c.data_type">{{ c.name }}</span>
              <span v-if="detailCols.length > 16" class="qq-muted">…共 {{ detailCols.length }} 列</span>
            </div>
            <button type="button" class="btn xs primary" @click="fillSelectColumns(detailTable, detailCols)">
              填充前 {{ Math.min(12, detailCols.length) }} 列
            </button>
          </template>
        </div>
      </template>
    </div>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps({
  connectionId: { type: String, default: '' },
  engine: { type: String, default: '' },
  database: { type: String, default: '' },
  activeTable: { type: String, default: '' },
  activeCollection: { type: String, default: '' },
  tables: { type: Array, default: () => [] },
  collections: { type: Array, default: () => [] },
})

const emit = defineEmits(['fill-sql', 'fill-mongo'])

const isMongo = computed(() => props.engine === 'mongodb')

const queryRaw = ref('')
const queryDebounced = ref('')
let debTimer = null

function onSearchInput() {
  clearTimeout(debTimer)
  debTimer = setTimeout(() => {
    queryDebounced.value = queryRaw.value.trim().toLowerCase()
  }, 200)
}

function recentKey() {
  return props.connectionId ? `qe-quick-${props.connectionId}` : ''
}

function readRecent() {
  try {
    const k = recentKey()
    if (!k || typeof sessionStorage === 'undefined') return []
    const raw = sessionStorage.getItem(k)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function pushRecent(name) {
  const k = recentKey()
  if (!k || !name || typeof sessionStorage === 'undefined') return
  const arr = readRecent().filter((x) => x !== name)
  arr.unshift(name)
  sessionStorage.setItem(k, JSON.stringify(arr.slice(0, 10)))
}

function quoteIdent(raw) {
  const e = (props.engine || '').toLowerCase()
  const n = String(raw || '')
  if (!/^[a-zA-Z0-9_]+$/.test(n)) {
    return '"' + n.replace(/"/g, '""') + '"'
  }
  if (e === 'mysql' || e === 'mariadb') return '`' + n + '`'
  return '"' + n.replace(/"/g, '""') + '"'
}

function rankNames(names, activeName, q) {
  const recent = readRecent()
  const filtered = names.filter((n) => !q || n.toLowerCase().includes(q))
  const scored = filtered.map((name) => {
    let tier = 400
    if (name === activeName) tier = 0
    else {
      const ri = recent.indexOf(name)
      if (ri >= 0) tier = 30 + ri
    }
    const ln = name.toLowerCase()
    if (q) {
      if (ln.startsWith(q)) tier += 5
      else tier += 60
    }
    return { name, tier }
  })
  scored.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
  return scored.map((x) => x.name)
}

const sqlTableNames = computed(() => (props.tables || []).map((t) => t?.name).filter(Boolean))

const rankedTables = computed(() =>
  rankNames(sqlTableNames.value, props.activeTable || '', queryDebounced.value),
)

const mongoCollectionNames = computed(() =>
  (props.collections || []).map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean),
)

const rankedCollections = computed(() =>
  rankNames(mongoCollectionNames.value, props.activeCollection || '', queryDebounced.value),
)

const detailTable = ref('')
const detailCols = ref([])
const detailLoading = ref(false)
const detailErr = ref('')

watch(
  () => props.connectionId,
  () => {
    detailTable.value = ''
    detailCols.value = []
    detailErr.value = ''
    queryRaw.value = ''
    queryDebounced.value = ''
  },
)

watch(
  () => props.engine,
  () => {
    detailTable.value = ''
    detailCols.value = []
    detailErr.value = ''
  },
)

async function toggleColumns(tableName) {
  if (detailTable.value === tableName && detailCols.value.length) {
    detailTable.value = ''
    detailCols.value = []
    detailErr.value = ''
    return
  }
  detailTable.value = tableName
  detailCols.value = []
  detailErr.value = ''
  detailLoading.value = true
  try {
    const data = await apiFetch('/database/table/columns', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: tableName,
      },
    })
    detailCols.value = data.columns || []
  } catch (e) {
    detailErr.value = e.message || String(e)
    detailCols.value = []
  } finally {
    detailLoading.value = false
  }
}

function fillSelectStar(tableName) {
  const qi = quoteIdent(tableName)
  pushRecent(tableName)
  emit('fill-sql', `SELECT * FROM ${qi} LIMIT 100`)
}

function fillSelectColumns(tableName, cols) {
  const qi = quoteIdent(tableName)
  const max = 12
  const picked = cols.slice(0, max).map((c) => quoteIdent(c.name))
  let sql = `SELECT ${picked.join(', ')}\nFROM ${qi}\nLIMIT 100`
  if (cols.length > max) {
    sql += `\n-- 共 ${cols.length} 列，已列出前 ${max} 列，按需增删`
  }
  pushRecent(tableName)
  emit('fill-sql', sql)
}

function fillMongoPipeline(collectionName) {
  pushRecent(collectionName)
  emit('fill-mongo', '[{"$match":{}},{"$limit":50}]')
}
</script>

<style scoped>
.qq-details {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafafa;
}
.qq-summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  color: #111827;
}
.qq-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qq-hint {
  margin: 0;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
}
.qq-label {
  font-size: 11px;
  color: #374151;
}
.qq-search {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  font-size: 12px;
}
.qq-scroll {
  max-height: 200px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
}
.qq-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 12px;
}
.qq-row:last-child {
  border-bottom: none;
}
.qq-name {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qq-name.hi {
  color: #4f46e5;
  font-weight: 600;
}
.qq-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px;
}
.qq-detail {
  padding: 8px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
}
.qq-muted {
  font-size: 11px;
  color: #9ca3af;
}
.qq-err {
  font-size: 11px;
  color: #b91c1c;
}
.qq-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4338ca;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}
.btn.xs {
  padding: 3px 8px;
  font-size: 11px;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
</style>
