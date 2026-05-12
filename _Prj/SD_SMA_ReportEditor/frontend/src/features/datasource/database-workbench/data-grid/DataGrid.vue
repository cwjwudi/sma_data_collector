<template>
  <div class="grid-wrap" :class="{ 'grid-fill': fillHeight }">
    <div class="status" v-if="status">{{ status }}</div>
    <div
      v-if="columns.length"
      ref="scrollEl"
      class="scroll"
      @scroll.passive="onScroll"
    >
      <table class="grid" :class="{ 'grid-virtual': useVirtual }">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="useVirtual">
            <tr v-if="topPad > 0" class="virt-pad" aria-hidden="true">
              <td class="virt-pad-cell" :colspan="columns.length" :style="{ height: topPad + 'px' }" />
            </tr>
            <tr
              v-for="item in visibleRows"
              :key="item.idx"
              class="virt-row"
              :style="{ height: ROW_HEIGHT + 'px' }"
            >
              <td
                v-for="c in columns"
                :key="c"
                :class="{ 'td-link': Boolean(fkHints && fkHints[c]) }"
                :title="fkHints && fkHints[c] ? `跳转关联：${fkHints[c].targetTable}` : ''"
                @click="onCellClick(c, item.row)"
              >
                {{ formatCell(item.row[c]) }}
              </td>
            </tr>
            <tr v-if="bottomPad > 0" class="virt-pad" aria-hidden="true">
              <td class="virt-pad-cell" :colspan="columns.length" :style="{ height: bottomPad + 'px' }" />
            </tr>
          </template>
          <template v-else>
            <tr v-for="(row, idx) in rows" :key="idx">
              <td
                v-for="c in columns"
                :key="c"
                :class="{ 'td-link': Boolean(fkHints && fkHints[c]) }"
                :title="fkHints && fkHints[c] ? `跳转关联：${fkHints[c].targetTable}` : ''"
                @click="onCellClick(c, row)"
              >
                {{ formatCell(row[c]) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'

/** 超过此行数启用虚拟滚动（仅渲染可视区附近行） */
const VIRTUAL_THRESHOLD = 120
/** 与 `.virt-row` / `.grid-virtual td` 样式一致的可视行高 */
const ROW_HEIGHT = 33
const OVERSCAN = 12

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  status: { type: String, default: '' },
  /** 列名 -> { targetTable, targetColumn } */
  fkHints: { type: Object, default: null },
  /** 父级为纵向 flex 且有余高时撑满，滚动发生在表格内部 */
  fillHeight: { type: Boolean, default: false },
})

const emit = defineEmits(['cell-click'])

const scrollEl = ref(null)
const scrollTop = ref(0)
const viewportH = ref(480)

let scrollRaf = 0

function updateViewport() {
  const el = scrollEl.value
  if (!el) return
  const h = el.clientHeight
  if (h > 0) viewportH.value = h
}

function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    const el = scrollEl.value
    if (el) scrollTop.value = el.scrollTop
    updateViewport()
  })
}

const useVirtual = computed(() => props.rows.length > VIRTUAL_THRESHOLD)

const sliceRange = computed(() => {
  const total = props.rows.length
  if (!useVirtual.value || total === 0) {
    return { start: 0, end: total }
  }
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewportH.value / ROW_HEIGHT) + OVERSCAN * 2
  const end = Math.min(total, start + visibleCount)
  return { start, end }
})

const topPad = computed(() => {
  if (!useVirtual.value) return 0
  return sliceRange.value.start * ROW_HEIGHT
})

const bottomPad = computed(() => {
  if (!useVirtual.value) return 0
  const { end } = sliceRange.value
  return Math.max(0, props.rows.length - end) * ROW_HEIGHT
})

const visibleRows = computed(() => {
  const { start, end } = sliceRange.value
  const slice = props.rows.slice(start, end)
  return slice.map((row, i) => ({ row, idx: start + i }))
})

function resetScroll() {
  scrollTop.value = 0
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollTop = 0
    updateViewport()
  })
}

watch(
  () => props.rows.length,
  () => resetScroll(),
)

watch(
  () => props.columns.length + props.columns.join('\0'),
  () => resetScroll(),
)

function onResize() {
  updateViewport()
}

onMounted(() => {
  nextTick(() => {
    updateViewport()
  })
  window.addEventListener('resize', onResize, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

function formatCell(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function onCellClick(column, row) {
  if (!props.fkHints?.[column]) return
  emit('cell-click', { column, value: row[column], row })
}
</script>

<style scoped>
.grid-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.grid-wrap.grid-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.scroll {
  overflow: auto;
  max-height: 360px;
}
.grid-wrap.grid-fill .scroll {
  flex: 1;
  min-height: 0;
  max-height: none;
}
.grid {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}
.grid-virtual {
  table-layout: fixed;
}
.grid-virtual thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f9fafb;
  box-shadow: 0 1px 0 #e5e7eb;
}
.grid-virtual td {
  overflow: hidden;
  text-overflow: ellipsis;
}
th,
td {
  border: 1px solid #e5e7eb;
  padding: 6px 8px;
  white-space: nowrap;
}
.virt-pad {
  border: none !important;
}
.virt-pad td.virt-pad-cell {
  padding: 0 !important;
  border: none !important;
  vertical-align: top;
  line-height: 0;
  font-size: 0;
}
.virt-row td {
  vertical-align: middle;
}
.td-link {
  cursor: pointer;
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}
thead {
  background: #f9fafb;
}
.status {
  padding: 8px;
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}
</style>
