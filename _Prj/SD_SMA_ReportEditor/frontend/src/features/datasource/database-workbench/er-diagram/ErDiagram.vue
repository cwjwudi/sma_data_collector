<template>
  <div class="er">
    <svg v-if="layout.nodes.length" :width="svgW" :height="svgH" class="svg">
      <line
        v-for="e in layout.edges"
        :key="e.id"
        :x1="e.x1"
        :y1="e.y1"
        :x2="e.x2"
        :y2="e.y2"
        stroke="#9ca3af"
        stroke-width="2"
      />
      <g v-for="n in layout.nodes" :key="n.id">
        <rect :x="n.x - 60" :y="n.y - 18" width="120" height="36" rx="6" fill="#eef2ff" stroke="#6366f1" />
        <text :x="n.x" :y="n.y + 4" text-anchor="middle" font-size="12" fill="#1f2937">{{ n.label }}</text>
      </g>
    </svg>
    <p v-else class="empty">暂无图数据，请先导入 schema 或加载 catalog 后合并。</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  graph: {
    type: Object,
    default: () => ({ nodes: [], edges: [] }),
  },
})

const svgW = 640
const svgH = 360

const layout = computed(() => {
  const nodesIn = props.graph?.nodes || []
  const edgesIn = props.graph?.edges || []
  const n = nodesIn.length || 1
  const nodes = nodesIn.map((node, i) => {
    const angle = (2 * Math.PI * i) / n
    const cx = svgW / 2 + Math.cos(angle) * 200
    const cy = svgH / 2 + Math.sin(angle) * 120
    return { id: node.id, label: node.label || node.id, x: cx, y: cy }
  })
  const byId = Object.fromEntries(nodes.map((x) => [x.id, x]))
  const edges = []
  for (const e of edgesIn) {
    const s = byId[e.source]
    const t = byId[e.target]
    if (s && t) {
      edges.push({
        id: e.id,
        x1: s.x,
        y1: s.y,
        x2: t.x,
        y2: t.y,
      })
    }
  }
  return { nodes, edges }
})
</script>

<style scoped>
.er {
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
}
.svg {
  display: block;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
}
.empty {
  font-size: 13px;
  color: #6b7280;
}
</style>
