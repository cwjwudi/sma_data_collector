<template>
  <div class="page" :class="{ 'page-fill': tab === 'db' || tab === 'opc' }">
    <h2 class="page-title">数据源配置</h2>
    <div class="tabs-top">
      <button type="button" :class="{ on: tab === 'db' }" @click="tab = 'db'">数据库工作台</button>
      <button type="button" :class="{ on: tab === 'opc' }" @click="tab = 'opc'">OPC UA</button>
    </div>
    <div v-if="tab === 'db'" class="page-tab-body">
      <DatabaseWorkbench />
    </div>
    <div v-else class="page-tab-body">
      <OpcUaPanel />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import DatabaseWorkbench from '@/features/datasource/database-workbench/DatabaseWorkbench.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'

const route = useRoute()

const tab = ref('db')

function syncTabFromRoute() {
  const q = route.query.tab
  const s = typeof q === 'string' ? q.trim().toLowerCase() : Array.isArray(q) ? q[0]?.trim().toLowerCase() ?? '' : ''
  if (s === 'opc' || s === 'opcua') tab.value = 'opc'
  else if (s === 'db' || s === '' || !s) tab.value = 'db'
}

watch(() => route.query.tab, syncTabFromRoute, { flush: 'pre' })
onMounted(syncTabFromRoute)
</script>

<style scoped>
.page-fill {
  display: flex;
  flex-direction: column;
  /* .content-scroll 为纵向 flex，此处吃掉剩余高度以便工作台内部再滚动 */
  flex: 1 1 auto;
  min-height: 0;
}
.page-tab-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.tabs-top {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.tabs-top button {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.tabs-top button.on {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
</style>
