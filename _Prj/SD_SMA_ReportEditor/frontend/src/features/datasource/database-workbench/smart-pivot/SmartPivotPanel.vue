<template>
  <div class="sp-root">
    <div v-if="isMongo" class="sp-muted">MongoDB 连接暂不支持「智能透视」，请使用 SQL 引擎连接。</div>
    <template v-else>
      <div v-if="!tableName" class="sp-muted">请在左侧对象树中选择一张表。</div>
      <template v-else>
        <div v-if="lastError" class="sp-err">{{ lastError }}</div>
        <div class="sp-toolbar">
          <span class="sp-label">采样条数</span>
          <select v-model.number="sampleLimit" class="sp-select">
            <option :value="100">100</option>
            <option :value="500">500</option>
            <option :value="1000">1000</option>
            <option :value="2000">2000</option>
            <option :value="5000">5000</option>
          </select>
          <span class="sp-label">时间轴列</span>
          <select v-model="timeColumn" class="sp-select sp-select-wide">
            <option value="">（自动推断）</option>
            <option v-for="c in profile?.columns || []" :key="c.name" :value="c.name">{{ c.name }}</option>
          </select>
          <template v-if="profile?.mode === 'timeseries' || timeColumn">
            <button type="button" class="btn sm" @click="presetRange('today')">今天</button>
            <button type="button" class="btn sm" @click="presetRange('week')">本周</button>
            <button type="button" class="btn sm" @click="presetRange('month')">本月</button>
            <button type="button" class="btn sm" @click="presetRange('year')">今年</button>
            <button type="button" class="btn sm" @click="clearRange">时间不限</button>
            <label class="sp-dt">起 <input v-model="timeStart" type="datetime-local" class="sp-input-dt" /></label>
            <label class="sp-dt">止 <input v-model="timeEnd" type="datetime-local" class="sp-input-dt" /></label>
          </template>
          <span class="sp-label">分布柱状</span>
          <select v-model="categoryColumn" class="sp-select sp-select-wide">
            <option value="">（关闭 · 折线）</option>
            <option v-for="n in profile?.categorical_columns || []" :key="n" :value="n">{{ n }}</option>
          </select>
          <button type="button" class="btn sm primary" :disabled="loading" @click="loadSeries">刷新图表</button>
          <button type="button" class="btn sm" :disabled="!chartPayload || exportingPng" @click="exportPng">导出 PNG</button>
          <button type="button" class="btn sm" :disabled="!drillRows.length" @click="exportCsv">导出 CSV</button>
        </div>
        <div class="sp-metrics">
          <span class="sp-label">数值指标（多选）</span>
          <label v-for="n in profile?.numeric_columns || []" :key="n" class="sp-check">
            <input v-model="selectedMetrics" type="checkbox" :value="n" />
            {{ n }}
          </label>
        </div>
        <div class="sp-filters">
          <span class="sp-label">筛选</span>
          <select v-model="filterDraft.column" class="sp-select">
            <option value="">列…</option>
            <option v-for="c in profile?.columns || []" :key="c.name" :value="c.name">{{ c.name }}</option>
          </select>
          <input v-model="filterDraft.value" type="text" class="sp-input" placeholder="等于…" />
          <button type="button" class="btn sm" @click="addFilter">添加</button>
          <span v-for="(f, i) in filters" :key="i" class="sp-chip">
            {{ f.column }}={{ f.value }}
            <button type="button" class="sp-chip-x" @click="filters.splice(i, 1)">×</button>
          </span>
        </div>
        <div v-if="insightLines.length" class="sp-insights">
          <span v-for="(t, i) in insightLines" :key="i">{{ t }}</span>
        </div>
        <div v-if="statsCards.length" class="sp-stats">
          <div v-for="(s, i) in statsCards" :key="i" class="sp-stat-card">
            <div class="sp-stat-title">{{ s.title }}</div>
            <div class="sp-stat-grid">
              <span>最小</span><b>{{ fmtNum(s.min) }}</b>
              <span>最大</span><b>{{ fmtNum(s.max) }}</b>
              <span>平均</span><b>{{ fmtNum(s.mean) }}</b>
              <span>中位</span><b>{{ fmtNum(s.median) }}</b>
            </div>
          </div>
        </div>
        <div ref="chartEl" class="sp-chart" />
        <div class="sp-drill-bar">
          <button type="button" class="btn sm" :disabled="!brushIndices.length" @click="drillFromBrush">
            将框选范围同步到下方表格
          </button>
          <span class="sp-muted sp-hint">工具栏中的「横向刷选」框选区间后点击同步。</span>
        </div>
        <DataGrid fill-height :columns="drillCols" :rows="drillRows" :status="drillStatus" />
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { apiFetch } from '@/api/client.js'
import DataGrid from '../data-grid/DataGrid.vue'

const props = defineProps({
  connectionId: { type: String, default: '' },
  database: { type: String, default: '' },
  engine: { type: String, default: '' },
  tableName: { type: String, default: '' },
})

const isMongo = computed(() => (props.engine || '').toLowerCase() === 'mongodb')

const chartEl = ref(null)
let chartInstance = null

const profile = ref(null)
const chartPayload = ref(null)
const loading = ref(false)
const lastError = ref('')

const sampleLimit = ref(2000)
const timeColumn = ref('')
const timeStart = ref('')
const timeEnd = ref('')
const categoryColumn = ref('')
const selectedMetrics = ref([])
const filters = ref([])
const filterDraft = ref({ column: '', value: '' })

const drillCols = ref([])
const drillRows = ref([])
const drillStatus = ref('')
const lastSortKey = ref('')

const brushIndices = ref([])
const exportingPng = ref(false)

/** 切换表/连接加载图表时抑制「维度」重载，避免与 loadProfile 末尾 reset 重复请求 */
const suppressParamReload = ref(false)

let timeRangeReloadTimer = null

const insightLines = computed(() => {
  const p = chartPayload.value
  if (!p) return []
  const w = p.warnings || []
  const i = p.insights || []
  return [...w, ...i].filter(Boolean)
})

const statsCards = computed(() => {
  const p = chartPayload.value
  if (!p || !p.stats) return []
  const st = p.stats
  const out = []
  if (p.chart_kind === 'bar') {
    out.push({ title: '分布（条数）', ...st })
    return out
  }
  for (const k of Object.keys(st)) {
    const o = st[k]
    if (o && typeof o === 'object' && 'mean' in o) {
      out.push({ title: k, ...o })
    }
  }
  return out
})

function fmtNum(v) {
  if (v == null || Number.isNaN(v)) return '—'
  const n = Number(v)
  if (Math.abs(n) > 1e6) return n.toExponential(2)
  return String(Math.round(n * 1000) / 1000)
}

function toLocalDatetimeValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function presetRange(kind) {
  const now = new Date()
  const end = toLocalDatetimeValue(now)
  const start = new Date(now)
  if (kind === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (kind === 'week') {
    start.setDate(start.getDate() - 7)
  } else if (kind === 'month') {
    start.setMonth(start.getMonth() - 1)
  } else if (kind === 'year') {
    start.setFullYear(start.getFullYear() - 1)
  }
  timeStart.value = toLocalDatetimeValue(start)
  timeEnd.value = end
}

function clearRange() {
  timeStart.value = ''
  timeEnd.value = ''
}

function localDatetimeToApi(s) {
  if (!s || !String(s).trim()) return null
  const t = String(s).trim()
  if (!t.includes('T')) return t
  const iso = t.replace('T', ' ')
  return iso.length <= 16 ? `${iso}:00` : iso
}

function addFilter() {
  const col = (filterDraft.value.column || '').trim()
  const val = filterDraft.value.value
  if (!col || val === '' || val == null) return
  filters.value = [...filters.value, { column: col, value: String(val) }]
  filterDraft.value = { column: '', value: '' }
}

/** 从 brush 的 coordRange 推导类目轴上的连续下标 */
function indicesFromCoordRange(coordRange, xData) {
  if (!coordRange || !xData.length) return []
  let lo
  let hi
  if (Array.isArray(coordRange[0])) {
    lo = coordRange[0][0]
    hi = coordRange[0][1]
  } else {
    lo = coordRange[0]
    hi = coordRange[1]
  }
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    const n0 = Number(lo)
    const n1 = Number(hi)
    const i0 = Math.max(0, Math.min(xData.length - 1, Math.floor(Math.min(n0, n1))))
    const i1 = Math.max(0, Math.min(xData.length - 1, Math.ceil(Math.max(n0, n1))))
    if (i0 <= i1) {
      const out = []
      for (let i = i0; i <= i1; i++) out.push(i)
      return out
    }
  }
  const s0 = lo != null && lo !== '' ? String(lo) : ''
  const s1 = hi != null && hi !== '' ? String(hi) : ''
  if (s0 || s1) {
    let i0 = 0
    let i1 = xData.length - 1
    if (s0) {
      const j = xData.findIndex((x) => String(x) >= s0)
      if (j >= 0) i0 = j
    }
    if (s1) {
      let j = xData.length - 1
      while (j >= 0 && String(xData[j]) > s1) j -= 1
      if (j >= 0) i1 = j
    }
    if (i0 <= i1) {
      const out = []
      for (let i = i0; i <= i1; i++) out.push(i)
      return out
    }
  }
  return []
}

function applyBrushFromEvent(ev) {
  const p = chartPayload.value
  if (!p) {
    brushIndices.value = []
    return
  }
  const xData = (p.x_axis || []).map((x) => (x === null || x === undefined ? '' : String(x)))

  const batch = ev?.batch?.[0]
  const idxSet = new Set()

  const selected = batch?.selected
  if (Array.isArray(selected)) {
    for (const s of selected) {
      const di = s?.dataIndex
      if (Array.isArray(di)) {
        for (const i of di) {
          if (Number.isFinite(i)) idxSet.add(i)
        }
      }
    }
  }

  if (idxSet.size === 0) {
    const areas = batch?.areas || ev?.areas || []
    for (const area of areas) {
      const cr = area?.coordRange
      if (!cr) continue
      for (const i of indicesFromCoordRange(cr, xData)) idxSet.add(i)
    }
  }

  if (idxSet.size === 0) {
    brushIndices.value = []
    return
  }

  brushIndices.value = Array.from(idxSet).sort((a, b) => a - b)
}

async function loadProfile() {
  profile.value = null
  chartPayload.value = null
  selectedMetrics.value = []
  categoryColumn.value = ''
  lastError.value = ''
  if (!props.connectionId || !props.tableName || isMongo.value) return
  try {
    const data = await apiFetch('/database/table/chart_profile', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: props.tableName,
      },
    })
    profile.value = data
    selectedMetrics.value = [...(data.default_metric_columns || [])]
    timeColumn.value = ''
  } catch (e) {
    lastError.value = e.message || String(e)
  }
}

async function loadSeries() {
  if (!props.connectionId || !props.tableName || isMongo.value) return
  loading.value = true
  lastError.value = ''
  brushIndices.value = []
  try {
    const body = {
      connection_id: props.connectionId,
      database: props.database || undefined,
      table: props.tableName,
      time_column: timeColumn.value || null,
      metric_columns: [...selectedMetrics.value],
      sample_limit: sampleLimit.value,
      time_start: localDatetimeToApi(timeStart.value),
      time_end: localDatetimeToApi(timeEnd.value),
      filters: filters.value.map((f) => ({ column: f.column, value: f.value })),
      category_column: categoryColumn.value || null,
    }
    const data = await apiFetch('/database/table/chart_series', { method: 'POST', body })
    chartPayload.value = data
    lastSortKey.value = data.sort_key_column || ''
    await nextTick()
    renderChart()
  } catch (e) {
    lastError.value = e.message || String(e)
    chartPayload.value = null
  } finally {
    loading.value = false
  }
}

function disposeChart() {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
}

function renderChart() {
  disposeChart()
  const el = chartEl.value
  const p = chartPayload.value
  if (!el || !p || !p.series?.length) return

  chartInstance = echarts.init(el, null, { renderer: 'canvas' })
  const xData = (p.x_axis || []).map((x) => (x === null || x === undefined ? '' : String(x)))
  const isBar = p.chart_kind === 'bar'

  const series = (p.series || []).map((s) => ({
    name: s.name,
    type: isBar ? 'bar' : 'line',
    data: s.data || [],
    smooth: true,
    showSymbol: xData.length < 80,
    ...(isBar && xData.length > 800 ? { large: true, largeThreshold: 600 } : {}),
  }))

  const markMetric = (p.series && p.series[0] && p.series[0].name) || ''
  const outliers = markMetric ? (p.outliers_by_metric || {})[markMetric] || [] : []
  if (outliers.length && series[0]) {
    series[0].markPoint = {
      symbolSize: 42,
      data: outliers.slice(0, 24).map((idx) => ({
        name: '偏离',
        coord: [idx, series[0].data[idx]],
      })),
    }
  }

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 48, right: 24, top: 40, bottom: 80 },
    toolbox: {
      feature: {
        dataZoom: { yAxisIndex: false },
        brush: { type: ['lineX', 'clear'] },
        restore: {},
        saveAsImage: { show: false },
      },
    },
    brush: {
      toolbox: ['lineX', 'clear'],
      xAxisIndex: 0,
      throttleType: 'debounce',
      throttleDelay: 300,
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: p.chart_kind === 'bar',
    },
    yAxis: { type: 'value', scale: true },
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 22, bottom: 8 }],
    series,
  }

  chartInstance.setOption(option)
  chartInstance.off('brushSelected')
  chartInstance.off('brushEnd')
  chartInstance.on('brushSelected', applyBrushFromEvent)
  chartInstance.on('brushEnd', applyBrushFromEvent)

  window.removeEventListener('resize', onResize)
  window.addEventListener('resize', onResize)
}

function onResize() {
  chartInstance?.resize()
}

async function drillFromBrush() {
  const idxs = [...brushIndices.value].sort((a, b) => a - b)
  if (!idxs.length || !props.tableName) return
  const p = chartPayload.value
  const i0 = idxs[0]
  const i1 = idxs[idxs.length - 1]
  drillStatus.value = '加载下钻…'
  try {
    if (p?.mode === 'timeseries') {
      const tc = timeColumn.value || profile.value?.suggested_time_column
      const xa = p.x_axis || []
      const ts = xa[i0]
      const te = xa[i1]
      const tsStr = ts != null ? String(ts) : ''
      const teStr = te != null ? String(te) : ''
      const body = {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: props.tableName,
        limit: 5000,
        offset: 0,
        time_column: tc || undefined,
        time_start: tsStr || undefined,
        time_end: teStr || undefined,
        filters: filters.value.map((f) => ({ column: f.column, value: f.value })),
        order_column: tc || undefined,
      }
      const data = await apiFetch('/database/table/preview_drill', { method: 'POST', body })
      drillCols.value = data.columns || []
      drillRows.value = data.rows || []
      drillStatus.value = `框选下钻 ${drillRows.value.length} 行`
    } else {
      const oc = lastSortKey.value
      const body = {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: props.tableName,
        limit: Math.min(5000, i1 - i0 + 1),
        offset: i0,
        filters: filters.value.map((f) => ({ column: f.column, value: f.value })),
        order_column: oc || undefined,
      }
      const data = await apiFetch('/database/table/preview_drill', { method: 'POST', body })
      drillCols.value = data.columns || []
      drillRows.value = data.rows || []
      drillStatus.value = `行区间 ${i0}–${i1} · ${drillRows.value.length} 行`
    }
  } catch (e) {
    drillCols.value = []
    drillRows.value = []
    drillStatus.value = e.message || String(e)
  }
}

function exportPng() {
  if (!chartInstance) return
  exportingPng.value = true
  try {
    const url = chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.tableName || 'chart'}-pivot.png`
    a.click()
  } finally {
    exportingPng.value = false
  }
}

function exportCsv() {
  const cols = drillCols.value
  const rows = drillRows.value
  if (!cols.length) return
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [cols.join(',')]
  for (const r of rows) {
    lines.push(cols.map((c) => esc(r[c])).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.tableName || 'drill'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

watch(
  () => [props.connectionId, props.database, props.tableName],
  () => {
    window.removeEventListener('resize', onResize)
    disposeChart()
    drillCols.value = []
    drillRows.value = []
    drillStatus.value = ''
    suppressParamReload.value = true
    loadProfile()
      .then(() => loadSeries())
      .finally(() => {
        suppressParamReload.value = false
      })
  },
  { immediate: true },
)

watch([timeColumn, categoryColumn, sampleLimit], () => {
  if (suppressParamReload.value) return
  if (!props.connectionId || !props.tableName || isMongo.value || !profile.value) return
  loadSeries()
})

watch([timeStart, timeEnd], () => {
  if (suppressParamReload.value) return
  if (!props.connectionId || !props.tableName || isMongo.value || !profile.value) return
  const tsMode = profile.value.mode === 'timeseries' || timeColumn.value
  if (!tsMode) return
  if (timeRangeReloadTimer != null) clearTimeout(timeRangeReloadTimer)
  timeRangeReloadTimer = setTimeout(() => {
    timeRangeReloadTimer = null
    if (suppressParamReload.value) return
    loadSeries()
  }, 300)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  disposeChart()
  if (timeRangeReloadTimer != null) clearTimeout(timeRangeReloadTimer)
})
</script>

<style scoped>
.sp-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.sp-muted {
  font-size: 13px;
  color: #6b7280;
  padding: 4px 0;
}
.sp-err {
  font-size: 12px;
  color: #b91c1c;
  background: #fef2f2;
  padding: 8px;
  border-radius: 6px;
}
.sp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sp-label {
  font-size: 12px;
  color: #6b7280;
}
.sp-select {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}
.sp-select-wide {
  min-width: 140px;
}
.sp-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.sp-check {
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sp-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sp-input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  width: 140px;
}
.sp-input-dt {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 11px;
}
.sp-dt {
  font-size: 11px;
  color: #374151;
}
.sp-chip {
  background: #eef2ff;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sp-chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.sp-insights {
  font-size: 12px;
  color: #4338ca;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.sp-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.sp-stat-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafafa;
  min-width: 160px;
}
.sp-stat-title {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 6px;
}
.sp-stat-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  font-size: 11px;
  color: #4b5563;
}
.sp-chart {
  width: 100%;
  height: 320px;
  min-height: 280px;
  flex-shrink: 0;
}
.sp-drill-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sp-hint {
  font-size: 11px;
}
.btn.primary {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.sp-root > :deep(.grid-wrap.grid-fill) {
  flex: 1;
  min-height: 160px;
}
</style>
