<template>
  <div class="grid-wrap">
    <div class="status" v-if="status">{{ status }}</div>
    <div class="scroll" v-if="columns.length">
      <table class="grid">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="idx">
            <td v-for="c in columns" :key="c">{{ formatCell(row[c]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  status: { type: String, default: '' },
})

function formatCell(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.grid-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.scroll {
  overflow: auto;
  max-height: 360px;
}
.grid {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;
}
th,
td {
  border: 1px solid #e5e7eb;
  padding: 6px 8px;
  white-space: nowrap;
}
thead {
  background: #f9fafb;
}
.status {
  padding: 8px;
  font-size: 12px;
  color: #6b7280;
}
</style>
