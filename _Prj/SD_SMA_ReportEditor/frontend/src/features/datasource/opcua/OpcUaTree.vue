<template>
  <div ref="treeRootRef" class="address-tree" role="tree">
    <div v-if="!rows.length" class="empty">无节点，请点击「刷新根」</div>
    <template v-else>
    <div
      v-for="row in rows"
      :key="row.key"
      class="tree-row"
      :class="{ 'tree-row--selected': isSelectedNode(row.node) }"
      :style="{ paddingLeft: `${10 + row.depth * 18}px` }"
      role="treeitem"
      :data-node-id="row.node.node_id || undefined"
      :aria-expanded="row.hasExpander ? row.node.expanded : undefined"
      :aria-selected="isSelectedNode(row.node) || undefined"
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
          <span v-if="isSelectedNode(row.node)" class="sel-badge" aria-hidden="true">✓ 已选</span>
          <span v-if="classAbbr(row.node)" class="nc-badge" :title="row.node.node_class || ''">{{
            classAbbr(row.node)
          }}</span>
          <span class="display-name">{{ row.node.display_name || row.node.browse_name || row.node.node_id || '—' }}</span>
          <span
            v-if="row.node.valueDataTypeLabel"
            class="dtype-badge"
            :title="'数据类型: ' + row.node.valueDataTypeLabel"
          >{{ row.node.valueDataTypeLabel }}</span>
        </span>
        <span class="row-sub mono">
          <span class="browse-part">{{ row.node.browse_name }}</span>
          <span v-if="row.node.node_id" class="nid">{{ row.node.node_id }}</span>
        </span>
        <span
          v-if="row.node.valueReadError"
          class="row-value row-value-err mono"
          :title="translateOpcuaMessage(row.node.valueReadError)"
        >⚠ {{ truncateOneLine(translateOpcuaMessage(row.node.valueReadError), 72) }}</span>
        <span
          v-else-if="row.node.valuePreview !== undefined && row.node.valuePreview !== null && row.node.valuePreview !== ''"
          class="row-value mono"
          :title="'= ' + row.node.valuePreview"
        >
          = {{ row.node.valuePreview }}
        </span>
        <span v-if="row.node.error" class="row-err">{{ translateOpcuaMessage(row.node.error) }}</span>
        <span v-if="row.node.errorMessage" class="row-err">{{ translateOpcuaMessage(row.node.errorMessage) }}</span>
      </button>
    </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { translateOpcuaMessage } from './opcua-messages.js'
import { opcTreeNodeHasExpander } from './opcua-tree-utils.js'

defineOptions({ name: 'OpcUaTree' })

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  /** 与 shallowRef 树配合：原地改节点后父组件递增，避免 rows 计算属性用缓存 */
  treeRev: { type: Number, default: 0 },
  /** 当前已选中节点的 NodeId；匹配的行会高亮显示 */
  selectedNodeId: { type: String, default: '' },
})

defineEmits(['toggle', 'pick'])

const treeRootRef = ref(null)

function isSelectedNode(n) {
  const sel = (props.selectedNodeId || '').trim()
  return !!sel && String(n?.node_id || '') === sel
}

function scrollSelectedIntoView() {
  const sel = (props.selectedNodeId || '').trim()
  const root = treeRootRef.value
  if (!sel || !root) return
  const el = root.querySelector(`[data-node-id="${CSS.escape(sel)}"]`)
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

watch(
  () => [props.selectedNodeId, props.treeRev],
  async () => {
    if (!(props.selectedNodeId || '').trim()) return
    await nextTick()
    scrollSelectedIntoView()
  },
)

function truncateOneLine(s, max) {
  if (!s || typeof s !== 'string') return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

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
    const hasExpander = opcTreeNodeHasExpander(n)
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
  align-items: center;
  gap: 6px;
  min-height: 44px;
  border-radius: 6px;
  border: 1px solid transparent;
  box-sizing: border-box;
}
.tree-row:hover {
  background: #f3f4f6;
}
.tree-row--selected,
.tree-row--selected:hover {
  background: #eef2ff;
  border-color: #a5b4fc;
  box-shadow: inset 3px 0 0 0 #4f46e5;
}
.tree-row--selected .display-name {
  color: #3730a3;
}
.tree-row--selected .nid {
  color: #6366f1;
}
.sel-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: #4f46e5;
  color: #fff;
}
.row-gutter {
  flex-shrink: 0;
  width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chev {
  box-sizing: border-box;
  min-width: 44px;
  min-height: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  color: #4b5563;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.chev:hover:not(:disabled) {
  background: #e5e7eb;
}
.chev:active:not(:disabled) {
  background: #d1d5db;
}
.chev:disabled {
  cursor: wait;
  opacity: 0.7;
}
.chev-icon {
  font-size: 12px;
  line-height: 1;
}
.chev-spacer {
  display: inline-block;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}
.loading-dot {
  width: 10px;
  height: 10px;
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
  min-height: 44px;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 8px 8px 8px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  border-radius: 4px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
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
.dtype-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid rgb(16 185 129 / 0.35);
  max-width: 120px;
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
.row-value {
  display: block;
  width: 100%;
  margin-top: 2px;
  font-size: 11px;
  color: #047857;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.row-value-err {
  color: #b45309;
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
</style>
