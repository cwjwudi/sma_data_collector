<template>
  <div class="rb">
    <div v-if="!isSqlEngine" class="rb-nosql">
      关系浏览器仅支持 MySQL / MariaDB / PostgreSQL / SQLite；MongoDB 请使用对象树与查询页。
    </div>
    <template v-else>
      <div class="rb-toolbar seg-tabs">
        <button type="button" :class="{ on: mode === 'structure' }" @click="mode = 'structure'">结构视图</button>
        <button type="button" :class="{ on: mode === 'data' }" @click="mode = 'data'">数据视图</button>
        <button type="button" class="btn ghost sm" :disabled="edgesLoading" @click="loadForeignKeys">
          {{ edgesLoading ? '加载中…' : '刷新关系图' }}
        </button>
        <span class="rb-hint" v-show="mode === 'structure'">
          滚轮缩放 · 空白拖拽平移 · 拖动表卡片 · 悬停加载摘要 · 点击连线查看孤儿与一致性
        </span>
        <span class="rb-hint" v-show="mode === 'data'">分页预览 · 外键列单元格可跳转关联表 ·「刷新（首页）」更新总行数</span>
      </div>
      <div class="rb-main" :class="{ dataEm: mode === 'data' }">
        <div
          v-show="mode === 'structure'"
          ref="canvasWrapRef"
          class="rb-canvas-wrap"
          @wheel.prevent="onWheel"
          @mousedown="onPanMouseDown"
        >
          <div class="rb-transform" :style="transformStyle">
            <svg class="rb-svg" :width="CANVAS_W" :height="CANVAS_H">
              <path
                v-for="edge in drawableEdges"
                :key="edge.id"
                :d="edge.d"
                fill="none"
                :stroke-width="selectedEdge?.id === edge.id ? 4 : 2.5"
                :class="['rb-edge-path', edge.strokeClass]"
                @mousedown.stop.prevent="selectEdge(edge.raw)"
              />
            </svg>
            <div
              v-for="t in displayTables"
              :key="t.name"
              class="rb-card"
              :class="{ sel: selectedTable === t.name }"
              :style="{ left: t.x + 'px', top: t.y + 'px', width: CARD_W + 'px' }"
              @mousedown.stop="startDragCard(t.name, $event)"
              @click.stop="onCardClick(t.name)"
              @mouseenter="touchPrefetch(t.name)"
            >
              <div class="rb-card-head">{{ t.name }}</div>
              <div class="rb-card-sub" :title="metaTooltip(t.name)">{{ metaLine(t.name) }}</div>
              <div class="rb-card-fields">{{ abbrevFields(t.name) }}</div>
            </div>
          </div>
        </div>
        <aside class="rb-panel">
          <section class="rb-sec">
            <h4>选中表 · 字段</h4>
            <p v-if="!selectedTable" class="muted">点击画布上的表卡片</p>
            <div v-else-if="colsLoading" class="muted">加载字段…</div>
            <div v-else class="rb-fields">
              <div v-for="c in panelColumns" :key="c.name" class="rb-field-row">
                <span class="rb-dot pk" v-if="c.is_primary_key" title="主键">P</span>
                <span class="rb-dot fk" v-else-if="c.fk_to_table" title="外键">F</span>
                <span class="rb-dot" v-else />
                <code>{{ c.name }}</code>
                <span class="typ">{{ c.data_type }}</span>
                <span v-if="c.fk_to_table" class="fk-ref">→ {{ c.fk_to_table }}</span>
              </div>
            </div>
          </section>
          <section v-show="mode === 'structure'" class="rb-sec rb-preview-placeholder">
            <h4>数据预览</h4>
            <p class="muted rb-preview-placeholder-text">
              结构视图仅显示关系图与字段列表；切换到「数据视图」可分页预览表数据并支持外键穿透。
            </p>
            <div class="rb-actions">
              <button type="button" class="btn sm primary" @click="mode = 'data'">切换到数据视图</button>
            </div>
          </section>
          <section v-show="mode === 'data'" class="rb-sec rb-preview-sec">
            <h4>数据预览</h4>
            <div class="rb-preview-toolbar">
              <button type="button" class="btn sm" :disabled="previewPage <= 1 || !selectedTable" @click="previewRbPrev">
                上一页
              </button>
              <span class="muted rb-preview-label toolbar-label"
                >第 {{ previewPage }} 页 · 每页 {{ PAGE_SIZE }} 行<span v-if="previewTotal != null"> · 共 {{ previewTotal }} 行</span></span
              >
              <button type="button" class="btn sm" :disabled="!canPreviewRbNext" @click="previewRbNext">下一页</button>
              <button type="button" class="btn sm" @click="loadPreview({ resetPage: true })">刷新（首页）</button>
            </div>
            <DataGrid
              fill-height
              :columns="previewCols"
              :rows="previewRows"
              :status="previewStatus"
              :fk-hints="previewFkHints"
              @cell-click="onPreviewCellNavigate"
            />
          </section>
          <section v-if="selectedEdge" class="rb-sec rb-edge-sec">
            <h4>关联 · {{ selectedEdge.from_table }} → {{ selectedEdge.to_table }}</h4>
            <p class="rb-edge-pair">{{ edgePairLabel }}</p>
            <p v-if="orphanLoading" class="muted">检测孤儿行…</p>
            <p v-else-if="orphanCount != null" :class="orphanCount > 0 ? 'warn' : 'ok'">
              孤儿行（子表无外键匹配）：{{ orphanCount }}
            </p>
            <p v-if="consistencyLoading" class="muted">一致性扫描…</p>
            <ul v-else-if="consistencyWarnings.length" class="rb-warn-list">
              <li v-for="(w, i) in consistencyWarnings" :key="i">{{ w }}</li>
            </ul>
            <p v-else-if="consistencyDone && !consistencyWarnings.length" class="ok">关联字段类型一致</p>
            <div class="rb-actions">
              <button type="button" class="btn sm primary" :disabled="joinBusy" @click="runJoinPreview">
                预览 JOIN 结果
              </button>
              <button type="button" class="btn sm" :disabled="countBusy" @click="fetchJoinCount">预估行数</button>
            </div>
            <p v-if="joinCount != null" class="rb-count">预估结果行数：{{ joinCount }}</p>
            <details class="rb-sql-details">
              <summary>高级 · SQL</summary>
              <pre class="rb-pre">{{ joinSqlOut }}</pre>
            </details>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { apiFetch } from '@/api/client.js'
import DataGrid from '../data-grid/DataGrid.vue'

const CANVAS_W = 3400
const CANVAS_H = 2400
const CARD_W = 172

const props = defineProps({
  connectionId: { type: String, default: '' },
  database: { type: String, default: '' },
  engine: { type: String, default: '' },
  tables: { type: Array, default: () => [] },
})

const isSqlEngine = computed(() => {
  const e = (props.engine || '').toLowerCase()
  return ['mysql', 'mariadb', 'postgres', 'sqlite'].includes(e)
})

const mode = ref('structure')
const edges = ref([])
const edgesLoading = ref(false)

const positions = ref({})
const scale = ref(0.82)
const tx = ref(30)
const ty = ref(24)

const selectedTable = ref('')
const selectedEdge = ref(null)

const canvasWrapRef = ref(null)
const dragCard = ref(null)
const panDrag = ref(null)

const columnsCache = ref({})
const colsLoading = ref(false)

const previewCols = ref([])
const previewRows = ref([])
const previewStatus = ref('')
const previewFilters = ref({ column: '', value: '' })

const PAGE_SIZE = 1000
const previewPage = ref(1)
const previewTotal = ref(null)

const pendingFkNavigate = ref(null)

const metaCache = ref({})

const orphanMap = ref({})
const orphanCount = ref(null)
const orphanLoading = ref(false)
const consistencyWarnings = ref([])
const consistencyLoading = ref(false)
const consistencyDone = ref(false)

const joinSqlOut = ref('')
const joinBusy = ref(false)
const countBusy = ref(false)
const joinCount = ref(null)

const layoutStorageKey = computed(
  () => `relBrowserLayout:${props.connectionId}:${props.database || '_'}`,
)

const transformStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

function defaultX(i, n) {
  const cols = Math.ceil(Math.sqrt(Math.max(n, 1)))
  return 80 + (i % cols) * (CARD_W + 44)
}

function defaultY(i) {
  const cols = Math.ceil(Math.sqrt(Math.max(displayNames.value.length, 1)))
  return 80 + Math.floor(i / cols) * 138
}

const displayNames = computed(() =>
  props.tables.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean),
)

const displayTables = computed(() => {
  const names = displayNames.value
  const pos = positions.value
  return names.map((name, i) => ({
    name,
    x: pos[name]?.x ?? defaultX(i, names.length),
    y: pos[name]?.y ?? defaultY(i),
  }))
})

function cardCenter(name) {
  const t = displayTables.value.find((x) => x.name === name)
  if (!t) return null
  return { x: t.x + CARD_W / 2, y: t.y + 52 }
}

const drawableEdges = computed(() => {
  const list = []
  for (const e of edges.value) {
    const c1 = cardCenter(e.from_table)
    const c2 = cardCenter(e.to_table)
    if (!c1 || !c2) continue
    const mx = (c1.x + c2.x) / 2
    const my = (c1.y + c2.y) / 2 - 36
    const d = `M ${c1.x} ${c1.y} Q ${mx} ${my} ${c2.x} ${c2.y}`
    const oc = orphanMap.value[e.id]
    let strokeClass = 'stroke-fk'
    if (selectedEdge.value?.id === e.id) strokeClass += ' stroke-sel'
    if (oc != null && oc > 0) strokeClass += ' stroke-warn'
    list.push({ id: e.id, d, raw: e, strokeClass })
  }
  return list
})

const panelColumns = computed(() => columnsCache.value[selectedTable.value] || [])

const previewFkHints = computed(() => {
  const cols = columnsCache.value[selectedTable.value] || []
  const m = {}
  for (const c of cols) {
    if (c.fk_to_table && c.fk_to_columns?.length) {
      m[c.name] = { targetTable: c.fk_to_table, targetColumn: c.fk_to_columns[0] }
    }
  }
  return m
})

const canPreviewRbNext = computed(() => {
  if (!selectedTable.value) return false
  if (previewRows.value.length < PAGE_SIZE) return false
  if (previewTotal.value != null) {
    return previewPage.value * PAGE_SIZE < previewTotal.value
  }
  return true
})

const edgePairLabel = computed(() => {
  const e = selectedEdge.value
  if (!e) return ''
  return `${e.from_columns?.join(', ') || '?'} → ${e.to_columns?.join(', ') || '?'}`
})

function loadLayout() {
  try {
    const raw = localStorage.getItem(layoutStorageKey.value)
    if (raw) positions.value = JSON.parse(raw) || {}
  } catch {
    positions.value = {}
  }
}

function saveLayout() {
  try {
    localStorage.setItem(layoutStorageKey.value, JSON.stringify(positions.value))
  } catch {
    /* ignore */
  }
}

watch(
  () => [props.connectionId, props.database],
  () => {
    loadLayout()
    edges.value = []
    selectedEdge.value = null
    orphanMap.value = {}
  },
)

watch(displayNames, (names) => {
  const pos = { ...positions.value }
  let changed = false
  names.forEach((name, i) => {
    if (pos[name] == null) {
      pos[name] = { x: defaultX(i, names.length), y: defaultY(i) }
      changed = true
    }
  })
  if (changed) positions.value = pos
})

watch(selectedTable, async (tbl, prev) => {
  if (!tbl) {
    previewCols.value = []
    previewRows.value = []
    previewStatus.value = ''
    previewPage.value = 1
    previewTotal.value = null
    return
  }
  const pend = pendingFkNavigate.value
  const resetPage = tbl !== prev || Boolean(pend && pend.targetTable === tbl)
  pendingFkNavigate.value = null
  if (pend && pend.targetTable === tbl) {
    previewFilters.value = { column: pend.targetColumn, value: pend.value }
  } else {
    previewFilters.value = { column: '', value: '' }
  }
  colsLoading.value = true
  try {
    const data = await apiFetch('/database/table/columns_extended', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: tbl,
      },
    })
    columnsCache.value = { ...columnsCache.value, [tbl]: data.columns || [] }
  } catch {
    columnsCache.value = { ...columnsCache.value, [tbl]: [] }
  } finally {
    colsLoading.value = false
  }
  await loadMeta(tbl)
  if (mode.value === 'data') {
    await loadPreview({ resetPage })
  }
})

watch(mode, async (m) => {
  if (m !== 'data' || !selectedTable.value || !props.connectionId) return
  await loadPreview({ resetPage: true })
})

async function loadMeta(tbl) {
  try {
    const m = await apiFetch('/database/table/meta', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: tbl,
      },
    })
    metaCache.value = { ...metaCache.value, [tbl]: m }
  } catch {
    /* ignore */
  }
}

function metaLine(name) {
  const m = metaCache.value[name]
  if (!m) return '悬停或选中加载元信息…'
  const parts = []
  if (m.approx_row_count != null) parts.push(`约 ${m.approx_row_count} 行`)
  if (m.table_comment) parts.push(String(m.table_comment).slice(0, 42))
  return parts.join(' · ') || '—'
}

function metaTooltip(name) {
  const m = metaCache.value[name]
  if (!m) return ''
  return [m.table_comment, m.last_update_time ? `更新：${m.last_update_time}` : '']
    .filter(Boolean)
    .join('\n')
}

function abbrevFields(name) {
  const cols = columnsCache.value[name]
  if (!cols?.length) return '字段加载中…'
  return cols
    .slice(0, 5)
    .map((c) => c.name)
    .join(', ')
}

async function touchPrefetch(name) {
  if (!props.connectionId || !name) return
  if (columnsCache.value[name]) return
  try {
    const data = await apiFetch('/database/table/columns_extended', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: name,
      },
    })
    columnsCache.value = { ...columnsCache.value, [name]: data.columns || [] }
  } catch {
    /* ignore */
  }
  if (!metaCache.value[name]) await loadMeta(name)
}

function onCardClick(name) {
  selectedTable.value = name
}

async function loadPreview(opts = { resetPage: false }) {
  const tbl = selectedTable.value
  if (!tbl || !props.connectionId) return
  if (opts.resetPage) {
    previewPage.value = 1
    previewTotal.value = null
  }
  previewStatus.value = '加载中…'
  try {
    const body = {
      connection_id: props.connectionId,
      database: props.database || undefined,
      table: tbl,
      limit: PAGE_SIZE,
      offset: (previewPage.value - 1) * PAGE_SIZE,
      include_total: previewPage.value === 1,
    }
    if (previewFilters.value.column && previewFilters.value.value !== '') {
      body.pk_filter_column = previewFilters.value.column
      body.pk_filter_value = String(previewFilters.value.value)
    }
    const data = await apiFetch('/database/table/preview', { method: 'POST', body })
    if (data.columns?.length) previewCols.value = data.columns
    previewRows.value = data.rows || []
    if (data.total != null) previewTotal.value = data.total
    const n = previewRows.value.length
    const start = (previewPage.value - 1) * PAGE_SIZE + (n > 0 ? 1 : 0)
    const end = (previewPage.value - 1) * PAGE_SIZE + n
    previewStatus.value =
      n > 0
        ? `第 ${previewPage.value} 页，显示 ${start}–${end} 行${previewTotal.value != null ? `（共 ${previewTotal.value} 行）` : ''}`
        : `第 ${previewPage.value} 页，本页无数据`
  } catch (e) {
    previewCols.value = []
    previewRows.value = []
    previewStatus.value = e.message || String(e)
  }
}

function previewRbPrev() {
  if (previewPage.value <= 1) return
  previewPage.value--
  loadPreview({ resetPage: false })
}

function previewRbNext() {
  previewPage.value++
  loadPreview({ resetPage: false })
}

function onPreviewCellNavigate({ column, value }) {
  const hint = previewFkHints.value[column]
  if (!hint || value === null || value === undefined || value === '') return
  pendingFkNavigate.value = {
    targetTable: hint.targetTable,
    targetColumn: hint.targetColumn,
    value: String(value),
  }
  selectedTable.value = hint.targetTable
}

async function loadForeignKeys() {
  if (!props.connectionId) return
  edgesLoading.value = true
  edges.value = []
  selectedEdge.value = null
  orphanMap.value = {}
  try {
    const data = await apiFetch('/database/schema/foreign_keys', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        tables: displayNames.value,
      },
    })
    edges.value = data.edges || []
    prefetchOrphansBackground()
  } catch {
    edges.value = []
  } finally {
    edgesLoading.value = false
  }
}

async function prefetchOrphansBackground() {
  for (const e of edges.value) {
    try {
      const data = await apiFetch('/database/relation/orphan_summary', {
        method: 'POST',
        body: {
          connection_id: props.connectionId,
          database: props.database || undefined,
          child_table: e.from_table,
          parent_table: e.to_table,
          child_columns: e.from_columns,
          parent_columns: e.to_columns,
        },
      })
      orphanMap.value = { ...orphanMap.value, [e.id]: data.orphan_count ?? null }
    } catch {
      /* ignore */
    }
  }
}

async function selectEdge(edge) {
  selectedEdge.value = edge
  joinCount.value = null
  joinSqlOut.value = ''
  orphanCount.value = orphanMap.value[edge.id] ?? null
  consistencyDone.value = false
  consistencyWarnings.value = []

  orphanLoading.value = true
  try {
    const data = await apiFetch('/database/relation/orphan_summary', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        child_table: edge.from_table,
        parent_table: edge.to_table,
        child_columns: edge.from_columns,
        parent_columns: edge.to_columns,
      },
    })
    orphanCount.value = data.orphan_count ?? null
    orphanMap.value = { ...orphanMap.value, [edge.id]: orphanCount.value }
  } catch {
    orphanCount.value = null
  } finally {
    orphanLoading.value = false
  }

  const cc = edge.from_columns?.[0]
  const pc = edge.to_columns?.[0]
  if (cc && pc) {
    consistencyLoading.value = true
    try {
      const cmp = await apiFetch('/database/relation/consistency', {
        method: 'POST',
        body: {
          connection_id: props.connectionId,
          database: props.database || undefined,
          child_table: edge.from_table,
          child_column: cc,
          parent_table: edge.to_table,
          parent_column: pc,
        },
      })
      consistencyWarnings.value = cmp.warnings || []
      consistencyDone.value = true
    } catch {
      consistencyWarnings.value = ['一致性扫描失败或当前引擎暂不可用（已支持 MySQL / MariaDB / PostgreSQL / SQLite）']
      consistencyDone.value = true
    } finally {
      consistencyLoading.value = false
    }
  }
}

function joinPayload(limit) {
  const e = selectedEdge.value
  if (!e) return null
  const pairs = e.from_columns.map((c, i) => [`${e.from_table}.${c}`, `${e.to_table}.${e.to_columns[i]}`])
  return {
    connection_id: props.connectionId,
    database: props.database || undefined,
    base_table: e.from_table,
    joins: [{ table: e.to_table, on_pairs: pairs }],
    columns: [],
    limit,
  }
}

async function runJoinPreview() {
  const body = joinPayload(40)
  if (!body) return
  joinBusy.value = true
  try {
    const data = await apiFetch('/database/visual/run', { method: 'POST', body })
    joinSqlOut.value = data.sql || ''
    previewCols.value = data.columns || []
    previewRows.value = data.rows || []
    previewStatus.value = `JOIN 预览 ${previewRows.value.length} 行`
  } catch (e) {
    joinSqlOut.value = e.message || String(e)
  } finally {
    joinBusy.value = false
  }
}

async function fetchJoinCount() {
  const base = joinPayload(100)
  if (!base) return
  countBusy.value = true
  try {
    const data = await apiFetch('/database/visual/count', {
      method: 'POST',
      body: base,
    })
    joinCount.value = data.count
    joinSqlOut.value = data.sql || joinSqlOut.value
  } catch {
    joinCount.value = null
  } finally {
    countBusy.value = false
  }
}

function onWheel(ev) {
  const dy = ev.deltaY
  const factor = dy > 0 ? 0.92 : 1.08
  const next = Math.min(2.2, Math.max(0.35, scale.value * factor))
  scale.value = next
}

function onPanMouseDown(ev) {
  if (ev.button !== 0) return
  const el = ev.target
  if (typeof el.closest === 'function') {
    if (el.closest('.rb-card')) return
    if (el.closest('.rb-edge-path')) return
  }
  startPan(ev)
}

function startPan(ev) {
  panDrag.value = { sx: ev.clientX, sy: ev.clientY, ox: tx.value, oy: ty.value }
}

function startDragCard(name, ev) {
  dragCard.value = {
    name,
    sx: ev.clientX,
    sy: ev.clientY,
    ox: positions.value[name]?.x ?? 0,
    oy: positions.value[name]?.y ?? 0,
  }
}

function onWinMove(ev) {
  if (panDrag.value) {
    const p = panDrag.value
    tx.value = p.ox + (ev.clientX - p.sx)
    ty.value = p.oy + (ev.clientY - p.sy)
  }
  if (dragCard.value) {
    const d = dragCard.value
    const dx = (ev.clientX - d.sx) / scale.value
    const dy = (ev.clientY - d.sy) / scale.value
    positions.value = {
      ...positions.value,
      [d.name]: { x: d.ox + dx, y: d.oy + dy },
    }
  }
}

function onWinUp() {
  if (dragCard.value) saveLayout()
  panDrag.value = null
  dragCard.value = null
}

onMounted(() => {
  loadLayout()
  window.addEventListener('mousemove', onWinMove)
  window.addEventListener('mouseup', onWinUp)
  loadForeignKeys()
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onWinMove)
  window.removeEventListener('mouseup', onWinUp)
})

watch(
  () => props.connectionId,
  () => {
    if (props.connectionId) loadForeignKeys()
  },
)
</script>

<style scoped>
.rb {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.rb-nosql {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}
.rb-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.rb-toolbar {
  margin-bottom: 0;
}
.rb-main {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) 340px;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.rb-main.dataEm {
  grid-template-columns: 1fr;
}
.rb-canvas-wrap {
  overflow: hidden;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  cursor: grab;
}
.rb-transform {
  position: relative;
  width: 3400px;
  height: 2400px;
}
.rb-svg {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
.rb-edge-path {
  pointer-events: stroke;
  cursor: pointer;
  stroke-linecap: round;
}
.stroke-fk {
  stroke: #6366f1;
  opacity: 0.85;
}
.stroke-fk.stroke-sel {
  stroke: #4338ca;
  opacity: 1;
}
.stroke-fk.stroke-warn {
  stroke: #dc2626;
}
.rb-card {
  position: absolute;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.06);
  cursor: grab;
  padding: 8px;
  user-select: none;
}
.rb-card.sel {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgb(99 102 241 / 0.35);
}
.rb-card-sub {
  margin-top: 4px;
  min-height: 2.6em;
}
.rb-card-fields {
  margin-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
}
.rb-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
}
.rb-preview-placeholder {
  flex-shrink: 0;
}
.rb-preview-placeholder-text {
  margin: 0 0 10px;
}
.rb-sec {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}
.rb-sec h4 {
  flex-shrink: 0;
}
.rb-fields {
  max-height: 200px;
  overflow: auto;
}
.rb-field-row {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  gap: 4px;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid #f3f4f6;
}
.rb-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: #e5e7eb;
}
.rb-dot.pk {
  background: #fef3c7;
  text-align: center;
  line-height: 14px;
  font-weight: 700;
  color: #92400e;
}
.rb-dot.fk {
  background: #dbeafe;
  text-align: center;
  line-height: 14px;
  font-weight: 700;
  color: #1d4ed8;
}
.fk-ref {
  color: #4f46e5;
}
.rb-preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.rb-preview-sec {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.rb-preview-sec > :deep(.grid-wrap.grid-fill) {
  flex: 1;
  min-height: 0;
}
.rb-edge-pair {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.warn {
  color: #b91c1c;
}
.ok {
  color: #15803d;
}
.rb-warn-list {
  margin: 0;
  padding-left: 18px;
  color: #b45309;
}
.rb-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.rb-count {
  margin: 8px 0 0;
}
.rb-sql-details {
  margin-top: 8px;
}
.rb-pre {
  margin: 6px 0 0;
  padding: 8px;
  background: #111827;
  color: #e5e7eb;
  border-radius: 6px;
  overflow: auto;
  max-height: 160px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
