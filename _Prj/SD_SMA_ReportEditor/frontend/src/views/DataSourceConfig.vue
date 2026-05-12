<template>
  <div class="page" :class="{ 'page-fill-db': tab === 'db' }">
    <h2 class="page-title">数据源配置</h2>
    <div class="tabs-top">
      <button type="button" :class="{ on: tab === 'db' }" @click="tab = 'db'">数据库工作台</button>
      <button type="button" :class="{ on: tab === 'opc' }" @click="tab = 'opc'">OPC UA</button>
    </div>
    <div v-if="tab === 'db'" class="page-db-body">
      <DatabaseWorkbench />
    </div>
    <OpcUaPanel v-else />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import DatabaseWorkbench from '@/features/datasource/database-workbench/DatabaseWorkbench.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'

const tab = ref('db')
</script>

<style scoped>
.page-fill-db {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: calc(100dvh - 160px);
}
.page-db-body {
  flex: 1;
  min-height: 0;
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
