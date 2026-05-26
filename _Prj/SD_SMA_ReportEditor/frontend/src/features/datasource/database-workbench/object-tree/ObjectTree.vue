<template>
  <div class="ot-root ds-side-pane" role="navigation" aria-label="数据库对象浏览">
    <header class="ot-head ds-pane-head">
      <div class="ot-head-text ds-pane-head-titles">
        <span class="ot-title ds-pane-title" role="heading" aria-level="3">架构浏览</span>
        <p class="ot-sub ds-pane-subtitle">选择库与对象，右侧查看数据或编写查询</p>
      </div>
      <div class="ds-pane-head-actions">
        <button type="button" class="btn sm ghost" title="重新连接并刷新架构" @click="$emit('refresh-catalog')">
          刷新架构
        </button>
        <span class="engine-pill" :title="engine">{{ engineLabel }}</span>
      </div>
    </header>

    <!-- MongoDB -->
    <template v-if="engine === 'mongodb'">
      <section class="ot-section">
        <div class="sec-head">
          <span class="sec-title">数据库</span>
          <span class="sec-count">{{ filteredMongoDbs.length }}/{{ databases.length }}</span>
        </div>
        <label class="filter-label" for="ot-mongo-db">筛选数据库</label>
        <input
          id="ot-mongo-db"
          v-model="mongoDbQuery"
          type="search"
          class="ot-filter"
          placeholder="输入以筛选库名…"
          autocomplete="off"
        />
        <div class="ot-scroll ot-scroll--sm">
          <button
            v-for="d in filteredMongoDbs"
            :key="d"
            type="button"
            class="ot-row"
            :class="{ active: d === activeDatabase }"
            @click="$emit('select-database', d)"
          >
            <span class="ot-icon" aria-hidden="true">◆</span>
            <span class="ot-name">{{ d }}</span>
          </button>
          <p v-if="!databases.length" class="ot-empty">暂无数据库，请检查连接或权限。</p>
          <p v-else-if="!filteredMongoDbs.length" class="ot-empty">无匹配库名，请调整筛选条件。</p>
        </div>
      </section>
      <section class="ot-section ot-section-grow">
        <div class="sec-head">
          <span class="sec-title">集合</span>
          <span class="sec-count">{{ filteredCollections.length }}/{{ collections.length }}</span>
        </div>
        <label class="filter-label" for="ot-mongo-coll">筛选集合</label>
        <input
          id="ot-mongo-coll"
          v-model="mongoCollQuery"
          type="search"
          class="ot-filter"
          placeholder="输入以筛选集合名…"
          autocomplete="off"
        />
        <div class="ot-scroll">
          <button
            v-for="c in filteredCollections"
            :key="c"
            type="button"
            class="ot-row"
            :class="{ active: c === activeCollection }"
            @click="$emit('select-collection', c)"
          >
            <span class="ot-icon" aria-hidden="true">▤</span>
            <span class="ot-name">{{ c }}</span>
          </button>
          <p v-if="activeDatabase && !collections.length" class="ot-empty">当前库下暂无集合。</p>
          <p v-else-if="!activeDatabase" class="ot-hint">请先在上方选择一个数据库。</p>
          <p v-else-if="!filteredCollections.length" class="ot-empty">无匹配集合名。</p>
        </div>
      </section>
    </template>

    <!-- SQLite -->
    <template v-else-if="engine === 'sqlite'">
      <section class="ot-section ot-section-grow">
        <div class="sec-head">
          <span class="sec-title">表与视图</span>
          <span class="sec-count">{{ filteredTables.length }}/{{ tables.length }}</span>
        </div>
        <label class="filter-label" for="ot-sqlite-obj">筛选对象</label>
        <input
          id="ot-sqlite-obj"
          v-model="tableQuery"
          type="search"
          class="ot-filter"
          placeholder="输入以筛选表或视图名…"
          autocomplete="off"
        />
        <div class="ot-scroll">
          <button
            v-for="t in filteredTables"
            :key="t.name"
            type="button"
            class="ot-row ot-row-with-meta"
            :class="{ active: t.name === activeTable }"
            @click="$emit('select-table', t.name)"
          >
            <span class="ot-icon" aria-hidden="true">{{ kindSymbol(t.kind) }}</span>
            <span class="ot-name">{{ t.name }}</span>
            <span class="kind-pill" :data-kind="normalizeKind(t.kind)">{{ kindShort(t.kind) }}</span>
          </button>
          <p v-if="!tables.length" class="ot-empty">未加载到表或视图。</p>
          <p v-else-if="!filteredTables.length" class="ot-empty">无匹配名称。</p>
        </div>
      </section>
    </template>

    <!-- MySQL / MariaDB / Postgres 等 -->
    <template v-else>
      <section class="ot-section">
        <div class="sec-head">
          <span class="sec-title">数据库</span>
          <span class="sec-count">{{ filteredDatabases.length }}/{{ databases.length }}</span>
        </div>
        <label class="filter-label" for="ot-sql-db">筛选数据库</label>
        <input
          id="ot-sql-db"
          v-model="dbQuery"
          type="search"
          class="ot-filter"
          placeholder="输入以筛选库名…"
          autocomplete="off"
        />
        <div class="ot-scroll ot-scroll--sm">
          <button
            v-for="d in filteredDatabases"
            :key="d"
            type="button"
            class="ot-row"
            :class="{ active: d === activeDatabase }"
            @click="$emit('select-database', d)"
          >
            <span class="ot-icon" aria-hidden="true">◆</span>
            <span class="ot-name">{{ d }}</span>
          </button>
          <p v-if="!databases.length" class="ot-empty">暂无数据库列表，请检查连接或权限。</p>
          <p v-else-if="!filteredDatabases.length" class="ot-empty">无匹配库名。</p>
        </div>
      </section>
      <section class="ot-section ot-section-grow">
        <div class="sec-head">
          <span class="sec-title">表与视图</span>
          <span class="sec-count">{{ filteredTables.length }}/{{ tables.length }}</span>
        </div>
        <p v-if="activeDatabase" class="ctx-line">当前库：<strong>{{ activeDatabase }}</strong></p>
        <label class="filter-label" for="ot-sql-obj">筛选表或视图</label>
        <input
          id="ot-sql-obj"
          v-model="tableQuery"
          type="search"
          class="ot-filter"
          placeholder="输入以筛选对象名…"
          autocomplete="off"
          :disabled="!activeDatabase && !!databases.length"
        />
        <div class="ot-scroll">
          <button
            v-for="t in filteredTables"
            :key="t.name"
            type="button"
            class="ot-row ot-row-with-meta"
            :class="{ active: t.name === activeTable }"
            @click="$emit('select-table', t.name)"
          >
            <span class="ot-icon" aria-hidden="true">{{ kindSymbol(t.kind) }}</span>
            <span class="ot-name">{{ t.name }}</span>
            <span class="kind-pill" :data-kind="normalizeKind(t.kind)">{{ kindShort(t.kind) }}</span>
          </button>
          <p v-if="databases.length && !activeDatabase" class="ot-hint">请先在上方选择一个数据库，再浏览表与视图。</p>
          <p v-else-if="activeDatabase && !tables.length" class="ot-empty">当前库下暂无表或视图。</p>
          <p v-else-if="activeDatabase && !filteredTables.length" class="ot-empty">无匹配对象名。</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  engine: { type: String, default: '' },
  databases: { type: Array, default: () => [] },
  tables: { type: Array, default: () => [] },
  collections: { type: Array, default: () => [] },
  activeDatabase: { type: String, default: '' },
  activeTable: { type: String, default: '' },
  activeCollection: { type: String, default: '' },
})
defineEmits(['select-database', 'select-table', 'select-collection', 'refresh-catalog'])

const dbQuery = ref('')
const tableQuery = ref('')
const mongoDbQuery = ref('')
const mongoCollQuery = ref('')

watch(
  () => props.engine,
  () => {
    dbQuery.value = ''
    tableQuery.value = ''
    mongoDbQuery.value = ''
    mongoCollQuery.value = ''
  },
)

const engineLabel = computed(() => {
  const m = {
    mysql: 'MySQL',
    mariadb: 'MariaDB',
    postgres: 'PostgreSQL',
    sqlite: 'SQLite',
    mongodb: 'MongoDB',
  }
  return m[props.engine] || (props.engine || '—')
})

function norm(s) {
  return String(s || '').toLowerCase()
}

function includes(hay, q) {
  if (!q.trim()) return true
  return norm(hay).includes(norm(q.trim()))
}

const filteredDatabases = computed(() =>
  (props.databases || []).filter((d) => includes(d, dbQuery.value)),
)

const filteredTables = computed(() =>
  (props.tables || []).filter((t) => includes(t.name, tableQuery.value)),
)

const filteredMongoDbs = computed(() =>
  (props.databases || []).filter((d) => includes(d, mongoDbQuery.value)),
)

const filteredCollections = computed(() =>
  (props.collections || []).filter((c) => includes(c, mongoCollQuery.value)),
)

function normalizeKind(kind) {
  const k = norm(kind)
  if (k.includes('view')) return 'view'
  if (k.includes('table')) return 'table'
  return 'other'
}

function kindShort(kind) {
  const k = normalizeKind(kind)
  if (k === 'view') return '视图'
  if (k === 'table') return '表'
  return '对象'
}

function kindSymbol(kind) {
  const k = normalizeKind(kind)
  if (k === 'view') return '◇'
  return '▣'
}
</script>

<style scoped>
.ot-root {
  --ot-border: #e2e8f0;
  --ot-bg: #ffffff;
  --ot-bg-sub: #f8fafc;
  --ot-text: #0f172a;
  --ot-muted: #64748b;
  --ot-accent: #4f46e5;
  --ot-accent-soft: #eef2ff;

  min-height: 0;
  height: 100%;
  color: var(--ot-text);
}

.ot-sub {
  max-width: 36ch;
}

.engine-pill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 5px 10px;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}

.ot-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--ot-border);
}

.ot-section:last-child {
  border-bottom: none;
}

.ot-section-grow {
  flex: 1;
  min-height: 120px;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ot-text);
}

.sec-count {
  font-size: 11px;
  color: var(--ot-muted);
  font-variant-numeric: tabular-nums;
}

.filter-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ot-filter {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 7px 10px;
  font-size: 13px;
  border: 1px solid var(--ot-border);
  border-radius: 8px;
  background: #fff;
  color: var(--ot-text);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ot-filter:focus {
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 18%);
}

.ot-filter:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--ot-bg-sub);
}

.ctx-line {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--ot-muted);
}

.ctx-line strong {
  color: var(--ot-text);
  font-weight: 600;
}

.ot-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px;
  margin: 0 -2px;
}

.ot-scroll--sm {
  max-height: min(220px, 32vh);
}

.ot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  margin: 0 0 4px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ot-text);
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.ot-row:hover {
  background: #f1f5f9;
}

.ot-row:focus-visible {
  outline: 2px solid var(--ot-accent);
  outline-offset: 1px;
}

.ot-row.active {
  background: var(--ot-accent-soft);
  border-color: #c7d2fe;
  color: #312e81;
}

.ot-row-with-meta {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
}

.ot-icon {
  flex-shrink: 0;
  width: 1.1em;
  font-size: 11px;
  color: var(--ot-muted);
  text-align: center;
}

.ot-row.active .ot-icon {
  color: #6366f1;
}

.ot-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kind-pill {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.02em;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
}

.kind-pill[data-kind='view'] {
  background: #fdf4ff;
  border-color: #f5d0fe;
  color: #86198f;
}

.kind-pill[data-kind='table'] {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.ot-empty,
.ot-hint {
  margin: 12px 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ot-muted);
}

.ot-hint {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
</style>
