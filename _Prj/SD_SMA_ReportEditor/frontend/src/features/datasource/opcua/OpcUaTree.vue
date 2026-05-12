<template>
  <div class="address-tree" role="tree">
    <div v-if="!rows.length" class="empty">无节点，请点击「刷新根」</div>
    <template v-else>
    <div
      v-for="row in rows"
      :key="row.key"
      class="tree-row"
      :style="{ paddingLeft: `${10 + row.depth * 18}px` }"
      role="treeitem"
      :aria-expanded="row.hasExpander ? row.node.expanded : undefined"
    >
      <span class="row-gutter">
        <button
          v-if="row.hasExpander"
          type="button"
          class="chev"
          :disabled="row.node.loading"
          :aria-expanded="row.node.loaded ? row.node.expanded : false"
          :aria-busy="row.node.loading"
          @click.stop="$emit('toggle', row.node)"
        >
          <span v-if="row.node.loading" class="loading-dot" aria-hidden="true" />
          <span v-else class="chev-icon" aria-hidden="true">{{ row.node.expanded ? '▼' : '▶' }}</span>
        </button>
        <span v-else class="chev-spacer" aria-hidden="true" />
      </span>
      <button type="button" class="row-body" @click="$emit('pick', row.node)">
        <span class="row-top">
          <span v-if="classAbbr(row.node)" class="nc-badge" :title="row.node.node_class || ''">{{
            classAbbr(row.node)
          }}</span>
          <span class="display-name">{{ row.node.display_name || row.node.browse_name || row.node.node_id || '—' }}</span>
        </span>
        <span class="row-sub mono">
          <span class="browse-part">{{ row.node.browse_name }}</span>
          <span v-if="row.node.node_id" class="nid">{{ row.node.node_id }}</span>
        </span>
        <span v-if="row.node.error" class="row-err">{{ row.node.error }}</span>
        <span v-if="row.node.errorMessage" class="row-err">{{ row.node.errorMessage }}</span>
      </button>
    </div>
    </template>
    <p v-if="truncationHint" class="trunc-hint">{{ truncationHint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

defineOptions({ name: 'OpcUaTree' })

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  /** 与 shallowRef 树配合：原地改节点后父组件递增，避免 rows 计算属性用缓存 */
  treeRev: { type: Number, default: 0 },
  /** 最近一次浏览是否可能因 80 条上限被截断 */
  truncationHint: { type: String, default: '' },
})

defineEmits(['toggle', 'pick'])

function classAbbr(n) {
  const c = n.node_class || ''
  if (!c) return ''
  const u = c.toUpperCase()
  if (u.includes('OBJECT')) return 'Obj'
  if (u.includes('VARIABLE')) return 'Var'
  if (u.includes('METHOD')) return 'Meth'
  if (u.includes('OBJECTTYPE')) return 'OTy'
  if (u.includes('VARIABLETYPE')) return 'VTy'
  if (u.includes('DATATYPE')) return 'DT'
  if (u.includes('REF')) return 'Ref'
  return c.slice(0, 3)
}

function buildRows(nodes, depth, out, idGen) {
  if (!nodes?.length) return
  for (const n of nodes) {
    const key = `r-${idGen.i++}-${depth}-${n.node_id || n.browse_name || 'x'}`
    const loaded = !!n.loaded
    const childCount = n.children?.length ?? 0
    const hasExpander = !loaded || childCount > 0
    out.push({ node: n, depth, key, hasExpander })
    if (n.expanded && loaded && childCount > 0) {
      buildRows(n.children, depth + 1, out, idGen)
    }
  }
}

const rows = computed(() => {
  void props.treeRev
  const out = []
  buildRows(props.nodes, 0, out, { i: 0 })
  return out
})
</script>

<style scoped>
.address-tree {
  font-size: 13px;
  min-width: 0;
}
.empty {
  color: #6b7280;
  padding: 12px 8px;
  font-size: 12px;
}
.tree-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-height: 36px;
  border-radius: 6px;
}
.tree-row:hover {
  background: #f3f4f6;
}
.row-gutter {
  flex-shrink: 0;
  width: 22px;
  display: flex;
  justify-content: center;
  padding-top: 6px;
}
.chev {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  color: #4b5563;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.chev:hover:not(:disabled) {
  background: #e5e7eb;
}
.chev:disabled {
  cursor: wait;
  opacity: 0.7;
}
.chev-icon {
  font-size: 10px;
  line-height: 1;
}
.chev-spacer {
  display: inline-block;
  width: 22px;
  height: 22px;
}
.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6366f1;
  animation: pulse 0.9s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.25;
  }
}
.row-body {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px 8px 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 4px;
}
.row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.nc-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e0e7ff;
  color: #3730a3;
}
.display-name {
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: #6b7280;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.browse-part {
  color: #4b5563;
}
.nid {
  color: #9ca3af;
  word-break: break-all;
}
.row-err {
  font-size: 11px;
  color: #b91c1c;
}
.trunc-hint {
  margin: 8px 0 0;
  padding: 6px 8px;
  font-size: 11px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>
