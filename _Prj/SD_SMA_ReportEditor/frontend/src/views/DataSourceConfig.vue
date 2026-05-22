<template>
  <div class="page" :class="{ 'page-fill': tab === 'db' || tab === 'opc' }">
    <h2 class="page-title">数据源配置</h2>
    <div class="tabs-top">
      <button type="button" :class="{ on: tab === 'db' }" @click="tab = 'db'">
        <ConnectionTabLed :state="aggregateHealthState(dbHealth)" class="tab-led" />
        数据库工作台
        <span class="tab-health-count">
          ({{ dbHealth.ok }}/{{ dbHealth.total
          }}<span v-if="dbHealth.fail" class="tab-health-fail"> · {{ dbHealth.fail }} 异常</span>)
        </span>
      </button>
      <button type="button" :class="{ on: tab === 'opc' }" @click="tab = 'opc'">
        <ConnectionTabLed :state="aggregateHealthState(opcHealth)" class="tab-led" />
        OPC UA
        <span class="tab-health-count">
          ({{ opcHealth.ok }}/{{ opcHealth.total
          }}<span v-if="opcHealth.fail" class="tab-health-fail"> · {{ opcHealth.fail }} 异常</span>)
        </span>
      </button>
    </div>
    <div v-show="tab === 'db'" class="page-tab-body">
      <DatabaseWorkbench ref="dbWorkbenchRef" @health-summary="onDbHealthSummary" />
    </div>
    <div v-show="tab === 'opc'" class="page-tab-body">
      <OpcUaPanel ref="opcPanelRef" @health-summary="onOpcHealthSummary" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import DatabaseWorkbench from '@/features/datasource/database-workbench/DatabaseWorkbench.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'
import ConnectionTabLed from '@/features/datasource/ConnectionTabLed.vue'
import { setDbHealthSummary } from '@/features/datasource/database-connection-health'

/** 在数据源配置页内，后台轮询全部连接健康（不依赖当前显示的子页签） */
const HEALTH_POLL_MS = 5000

const route = useRoute()

const tab = ref('db')
const dbWorkbenchRef = ref(null)
const opcPanelRef = ref(null)

const dbHealth = ref({ ok: 0, fail: 0, total: 0 })
const opcHealth = ref({ ok: 0, fail: 0, total: 0 })

let healthPollTimer = null

function aggregateHealthState(summary) {
  if (!summary?.total) return 'unknown'
  if (summary.fail > 0) return 'fail'
  if (summary.ok === summary.total) return 'ok'
  return 'unknown'
}

function onDbHealthSummary(summary) {
  dbHealth.value = summary
  setDbHealthSummary(summary)
}

function onOpcHealthSummary(summary) {
  opcHealth.value = summary
}

function probeAllDataSourceHealth() {
  nextTick(() => {
    dbWorkbenchRef.value?.probeAllConnections?.()
    opcPanelRef.value?.probeAllConnections?.()
  })
}

function startHealthPolling() {
  stopHealthPolling()
  probeAllDataSourceHealth()
  healthPollTimer = window.setInterval(probeAllDataSourceHealth, HEALTH_POLL_MS)
}

function stopHealthPolling() {
  if (healthPollTimer != null) {
    window.clearInterval(healthPollTimer)
    healthPollTimer = null
  }
}

function onConfigImported() {
  probeAllDataSourceHealth()
}

function syncTabFromRoute() {
  const q = route.query.tab
  const s = typeof q === 'string' ? q.trim().toLowerCase() : Array.isArray(q) ? q[0]?.trim().toLowerCase() ?? '' : ''
  if (s === 'opc' || s === 'opcua') tab.value = 'opc'
  else if (s === 'db' || s === '' || !s) tab.value = 'db'
}

watch(() => route.query.tab, syncTabFromRoute, { flush: 'pre' })

onMounted(() => {
  syncTabFromRoute()
  startHealthPolling()
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onUnmounted(() => {
  stopHealthPolling()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
.tab-led {
  flex-shrink: 0;
}
.tab-health-count {
  margin-left: 2px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.82;
}
.tabs-top button.on .tab-health-count {
  opacity: 0.9;
}
.tab-health-fail {
  color: #dc2626;
  font-weight: 600;
}
.tabs-top button.on .tab-health-fail {
  color: #fca5a5;
}
</style>
