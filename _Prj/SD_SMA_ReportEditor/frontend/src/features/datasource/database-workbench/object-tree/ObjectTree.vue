<template>
  <div class="ot">
    <h4>对象树</h4>
    <div v-if="engine === 'mongodb'" class="block">
      <div class="title">数据库</div>
      <ul>
        <li
          v-for="d in databases"
          :key="d"
          :class="{ active: d === activeDatabase }"
          @click="$emit('select-database', d)"
        >
          {{ d }}
        </li>
      </ul>
      <div class="title">集合</div>
      <ul>
        <li
          v-for="c in collections"
          :key="c"
          :class="{ active: c === activeCollection }"
          @click="$emit('select-collection', c)"
        >
          {{ c }}
        </li>
      </ul>
    </div>
    <div v-else-if="engine === 'sqlite'" class="block">
      <div class="title">表 / 视图</div>
      <ul>
        <li v-for="t in tables" :key="t.name" :class="{ active: t.name === activeTable }" @click="$emit('select-table', t.name)">
          {{ t.name }} <span class="muted">{{ t.kind }}</span>
        </li>
      </ul>
    </div>
    <div v-else class="block">
      <div class="title">数据库</div>
      <ul>
        <li
          v-for="d in databases"
          :key="d"
          :class="{ active: d === activeDatabase }"
          @click="$emit('select-database', d)"
        >
          {{ d }}
        </li>
      </ul>
      <div class="title">表 / 视图</div>
      <ul>
        <li v-for="t in tables" :key="t.name" :class="{ active: t.name === activeTable }" @click="$emit('select-table', t.name)">
          {{ t.name }} <span class="muted">{{ t.kind }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({
  engine: { type: String, default: '' },
  databases: { type: Array, default: () => [] },
  tables: { type: Array, default: () => [] },
  collections: { type: Array, default: () => [] },
  activeDatabase: { type: String, default: '' },
  activeTable: { type: String, default: '' },
  activeCollection: { type: String, default: '' },
})
defineEmits(['select-database', 'select-table', 'select-collection'])
</script>

<style scoped>
.ot {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  min-width: 200px;
  max-height: 520px;
  overflow: auto;
}
.title {
  font-size: 12px;
  color: #6b7280;
  margin: 8px 0 4px;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
li {
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
li.active {
  background: #eef2ff;
  color: #4338ca;
}
.muted {
  color: #9ca3af;
  font-size: 11px;
}
</style>
