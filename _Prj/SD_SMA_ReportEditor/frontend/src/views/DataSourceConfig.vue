<template>
  <div class="page page-fill-height">
    <h2 class="page-title">数据源配置</h2>
    <div class="tabs-top">
      <button type="button" :class="{ on: tab === 'db' }" @click="tab = 'db'">
        <ConnectionTabLed :state="aggregateHealthState(dbHealth)" class="tab-led" />
        数据库工作台
        <span class="tab-health-count">
          ({{ dbHealth.ok }}/{{ dbHealth.total
          }}<span
            v-if="dbHealth.fail"
            class="tab-health-fail tab-health-fail--click"
            title="点击查看异常详情"
            @click.stop="openHealthDetail"
          > · {{ dbHealth.fail }} 异常</span>)
        </span>
      </button>
      <button type="button" :class="{ on: tab === 'opc' }" @click="tab = 'opc'">
        <ConnectionTabLed :state="aggregateHealthState(opcHealth)" class="tab-led" />
        OPC UA
        <span class="tab-health-count">
          ({{ opcHealth.ok }}/{{ opcHealth.total
          }}<span
            v-if="opcHealth.fail"
            class="tab-health-fail tab-health-fail--click"
            title="点击查看异常详情"
            @click.stop="openHealthDetail"
          > · {{ opcHealth.fail }} 异常</span>)
        </span>
      </button>
    </div>
    <div v-show="tab === 'db'" class="page-tab-body">
      <DatabaseWorkbench ref="dbWorkbenchRef" @health-summary="onDbHealthSummary" />
    </div>
    <div v-show="tab === 'opc'" class="page-tab-body">
      <OpcUaPanel ref="opcPanelRef" @health-summary="onOpcHealthSummary" />
    </div>
    <ConnectionHealthFailuresDialog v-model="healthDetailOpen" />
  </div>
</template>

<script setup>
defineOptions({ name: 'DataSourceConfig' })

import { nextTick, ref, watch, onMounted, onUnmounted, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import DatabaseWorkbench from '@/features/datasource/database-workbench/DatabaseWorkbench.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'
import ConnectionTabLed from '@/features/datasource/ConnectionTabLed.vue'
import ConnectionHealthFailuresDialog from '@/features/datasource/ConnectionHealthFailuresDialog.vue'
import { dbConnectionHealth, opcHealthSummary } from '@/features/datasource/datasource-nav-health'
import {
  connectionProbeIntervalMs,
  loadConnectionProbePrefs,
} from '@/features/datasource/connection-probe-prefs'

const route = useRoute()

const tab = ref('db')
const dbWorkbenchRef = ref(null)
const opcPanelRef = ref(null)

const dbHealth = ref({ ...dbConnectionHealth.value })
const opcHealth = ref({ ...opcHealthSummary.value })
const healthDetailOpen = ref(false)

let healthPollTimer = null
let probePrefs = { enabled: false, intervalSec: 30 }

function aggregateHealthState(summary) {
  if (!summary?.total) return 'unknown'
  if (summary.fail > 0) return 'fail'
  if (summary.ok === summary.total) return 'ok'
  return 'unknown'
}

function onDbHealthSummary(summary) {
  dbHealth.value = summary
}

function onOpcHealthSummary(summary) {
  opcHealth.value = summary
}

function openHealthDetail() {
  healthDetailOpen.value = true
}

function probeAllDataSourceHealth() {
  nextTick(() => {
    dbWorkbenchRef.value?.probeAllConnections?.()
    opcPanelRef.value?.probeAllConnections?.()
  })
}

function stopHealthPolling() {
  if (healthPollTimer != null) {
    window.clearInterval(healthPollTimer)
    healthPollTimer = null
  }
}

function startHealthPolling() {
  stopHealthPolling()
  probeAllDataSourceHealth()
  if (!probePrefs.enabled) return
  healthPollTimer = window.setInterval(probeAllDataSourceHealth, connectionProbeIntervalMs(probePrefs))
}

async function reloadProbePrefs() {
  probePrefs = await loadConnectionProbePrefs()
  startHealthPolling()
}

function onConfigImported() {
  probeAllDataSourceHealth()
}

function onProbePrefsChanged(ev) {
  if (ev?.detail) {
    probePrefs = ev.detail
    startHealthPolling()
    return
  }
  void reloadProbePrefs()
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
  void reloadProbePrefs()
  window.addEventListener('report-editor-config-imported', onConfigImported)
  window.addEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
})

/** 页面被 keep-alive 缓存后再次进入：不重新拉连接/架构，仅恢复 Tab */
onActivated(() => {
  syncTabFromRoute()
})

onUnmounted(() => {
  stopHealthPolling()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
  window.removeEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
})
</script>

<style scoped>
.page.page-fill-height {
  display: flex;
  flex-direction: column;
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
.tab-health-fail--click {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
