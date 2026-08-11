<template>
  <div class="page page-fill-height">
    <header class="ds-hdr">
      <h2 class="page-title">数据源配置</h2>
      <DatasourceLockToggle v-model="datasourceLocked" />
    </header>
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

    <div class="page-tab-stage">
      <div
        v-if="pageBooting || panelChunkLoading"
        class="page-boot"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="page-boot__spinner" aria-hidden="true" />
        <p class="page-boot__text">{{ bootMessage }}</p>
      </div>

      <div v-show="tab === 'db' && dbMounted" class="page-tab-body">
        <DatabaseWorkbench
          v-if="dbMounted"
          ref="dbWorkbenchRef"
          :datasource-locked="datasourceLocked"
          @health-summary="onDbHealthSummary"
        />
      </div>
      <div v-show="tab === 'opc' && opcMounted" class="page-tab-body">
        <OpcUaPanel
          v-if="opcMounted"
          ref="opcPanelRef"
          :datasource-locked="datasourceLocked"
          @health-summary="onOpcHealthSummary"
        />
      </div>
    </div>

    <ConnectionHealthFailuresDialog v-model="healthDetailOpen" />
  </div>
</template>

<script setup>
defineOptions({ name: 'DataSourceConfig' })

import {
  defineAsyncComponent,
  nextTick,
  ref,
  watch,
  onMounted,
  onUnmounted,
  onActivated,
  provide,
} from 'vue'
import { useRoute } from 'vue-router'
import ConnectionTabLed from '@/features/datasource/ConnectionTabLed.vue'
import ConnectionHealthFailuresDialog from '@/features/datasource/ConnectionHealthFailuresDialog.vue'
import DatasourceLockToggle from '@/features/datasource/DatasourceLockToggle.vue'
import { dbConnectionHealth, opcHealthSummary } from '@/features/datasource/datasource-nav-health'
import {
  connectionProbeIntervalMs,
  loadConnectionProbePrefs,
} from '@/features/datasource/connection-probe-prefs'
import { usePageLifecycle } from '@/composables/usePageLifecycle'

const route = useRoute()
const { register: registerPageTask, isPageActive } = usePageLifecycle('DataSourceConfig')

const datasourceLocked = ref(false)
provide('datasourceLocked', datasourceLocked)

const tab = ref('db')
const dbWorkbenchRef = ref(null)
const opcPanelRef = ref(null)
/** 首次只挂载当前 Tab；切过一次后保留，避免反复销毁重建 */
const dbMounted = ref(false)
const opcMounted = ref(false)
const pageBooting = ref(true)
const panelChunkLoading = ref(true)
const bootMessage = ref('正在加载数据源工作台…')

const dbHealth = ref({ ...dbConnectionHealth.value })
const opcHealth = ref({ ...opcHealthSummary.value })
const healthDetailOpen = ref(false)

let healthPollTimer = null
let probePrefs = { enabled: false, intervalSec: 30 }
let bootWatchTimer = null
let bootSafetyTimer = null

/** 拆包：先渲染本页壳与加载提示，再异步加载重面板，避免侧栏点击后主线程长时间无反馈 */
const DatabaseWorkbench = defineAsyncComponent({
  loader: () => import('@/features/datasource/database-workbench/DatabaseWorkbench.vue'),
  delay: 0,
  onError() {
    panelChunkLoading.value = false
    pageBooting.value = false
    bootMessage.value = '数据库工作台加载失败，请刷新重试'
  },
})
const OpcUaPanel = defineAsyncComponent({
  loader: () => import('@/features/datasource/opcua/OpcUaPanel.vue'),
  delay: 0,
  onError() {
    panelChunkLoading.value = false
    pageBooting.value = false
    bootMessage.value = 'OPC UA 面板加载失败，请刷新重试'
  },
})

function unwrapExposedFlag(v) {
  if (v && typeof v === 'object' && 'value' in v) return Boolean(v.value)
  return Boolean(v)
}

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
  // 子面板挂载时会自行探活；此处只按偏好做定时轮询，避免进入页时重复探测叠压
  // B 级：离页不跑（侧栏探活另路，见 032 Q3）
  if (!isPageActive() || !probePrefs.enabled) return
  healthPollTimer = window.setInterval(probeAllDataSourceHealth, connectionProbeIntervalMs(probePrefs))
}

function pausePageProbeTasks() {
  stopHealthPolling()
  opcPanelRef.value?.pauseBrowsePolling?.()
}

function resumePageProbeTasks() {
  startHealthPolling()
  opcPanelRef.value?.resumeBrowsePolling?.()
}

registerPageTask({
  id: 'datasource-page-probe',
  scope: 'page',
  pause: pausePageProbeTasks,
  resume: resumePageProbeTasks,
})

async function reloadProbePrefs() {
  probePrefs = await loadConnectionProbePrefs()
  startHealthPolling()
}

function onConfigImported() {
  probeAllDataSourceHealth()
}

function onProbePrefsChanged(ev) {
  const d = ev?.detail
  // 手动保存会带完整 prefs；AI mirror 仅带 { via: 'ai' }，需回读服务端
  if (d && typeof d === 'object' && typeof d.enabled === 'boolean') {
    probePrefs = d
    startHealthPolling()
    return
  }
  void reloadProbePrefs()
}

function onDatasourceLockChanged(ev) {
  if (typeof ev?.detail?.locked === 'boolean') {
    datasourceLocked.value = ev.detail.locked
  }
}

function syncTabFromRoute() {
  const q = route.query.tab
  const s = typeof q === 'string' ? q.trim().toLowerCase() : Array.isArray(q) ? q[0]?.trim().toLowerCase() ?? '' : ''
  if (s === 'opc' || s === 'opcua') tab.value = 'opc'
  else if (s === 'db' || s === '' || !s) tab.value = 'db'
}

function ensureActivePanelMounted() {
  if (tab.value === 'opc') {
    if (!opcMounted.value) {
      panelChunkLoading.value = true
      bootMessage.value = '正在加载 OPC UA 面板…'
      opcMounted.value = true
    }
  } else if (!dbMounted.value) {
    panelChunkLoading.value = true
    bootMessage.value = '正在加载数据库工作台…'
    dbMounted.value = true
  }
}

function clearBootTimers() {
  if (bootWatchTimer != null) {
    window.clearInterval(bootWatchTimer)
    bootWatchTimer = null
  }
  if (bootSafetyTimer != null) {
    window.clearTimeout(bootSafetyTimer)
    bootSafetyTimer = null
  }
}

function finishPageBoot() {
  pageBooting.value = false
  panelChunkLoading.value = false
  clearBootTimers()
}

/** 仅当「当前 Tab」对应面板已就绪时收起遮罩，避免切 Tab 时被另一侧误关 */
function tryFinishBootForActiveTab() {
  if (tab.value === 'opc') {
    if (!opcPanelRef.value) return false
    finishPageBoot()
    return true
  }
  if (!dbWorkbenchRef.value) return false
  // defineExpose 的 ref 在脚本里不会自动解包
  if (unwrapExposedFlag(dbWorkbenchRef.value.connectionsLoading)) return false
  finishPageBoot()
  return true
}

function scheduleBootWatch() {
  clearBootTimers()
  bootWatchTimer = window.setInterval(() => {
    tryFinishBootForActiveTab()
  }, 80)
  bootSafetyTimer = window.setTimeout(() => {
    finishPageBoot()
  }, 12000)
}

function onDbPanelReady() {
  if (tab.value === 'db') {
    panelChunkLoading.value = false
    bootMessage.value = '正在加载已保存的连接…'
  }
  scheduleBootWatch()
  nextTick(() => {
    if (tab.value === 'db') tryFinishBootForActiveTab()
  })
}

function onOpcPanelReady() {
  if (tab.value !== 'opc') return
  panelChunkLoading.value = false
  bootMessage.value = '正在连接 OPC UA…'
  window.setTimeout(() => {
    tryFinishBootForActiveTab()
  }, 280)
}

watch(dbWorkbenchRef, (v) => {
  if (v) onDbPanelReady()
})

watch(opcPanelRef, (v) => {
  if (v) onOpcPanelReady()
})

watch(tab, () => {
  ensureActivePanelMounted()
  if (tab.value === 'opc' && opcPanelRef.value) {
    tryFinishBootForActiveTab()
  } else if (tab.value === 'db' && dbWorkbenchRef.value) {
    scheduleBootWatch()
    tryFinishBootForActiveTab()
  }
})

watch(() => route.query.tab, syncTabFromRoute, { flush: 'pre' })

onMounted(() => {
  syncTabFromRoute()
  ensureActivePanelMounted()
  void reloadProbePrefs()
  window.addEventListener('report-editor-config-imported', onConfigImported)
  window.addEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
  window.addEventListener('report-editor-datasource-lock-changed', onDatasourceLockChanged)
})

/** 页面被 keep-alive 缓存后再次进入：不重新拉连接/架构，仅恢复 Tab */
onActivated(() => {
  syncTabFromRoute()
  ensureActivePanelMounted()
  // 二次进入：目标 Tab 已挂载则不再挡全页；首次挂载的另一 Tab 仍走 panelChunkLoading
  if (tab.value === 'db' && dbMounted.value && dbWorkbenchRef.value) {
    pageBooting.value = false
    panelChunkLoading.value = false
  } else if (tab.value === 'opc' && opcMounted.value && opcPanelRef.value) {
    pageBooting.value = false
    panelChunkLoading.value = false
  }
})

onUnmounted(() => {
  stopHealthPolling()
  clearBootTimers()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
  window.removeEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
  window.removeEventListener('report-editor-datasource-lock-changed', onDatasourceLockChanged)
})
</script>

<style scoped>
.page.page-fill-height {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 420px;
  height: 100%;
}
.page-tab-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 360px;
  display: flex;
  flex-direction: column;
}
.page-tab-body {
  flex: 1 1 auto;
  min-height: 360px;
  display: flex;
  flex-direction: column;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  flex-shrink: 0;
}
.ds-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
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

.page-boot {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(248, 250, 252, 0.88);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  backdrop-filter: blur(2px);
}
.page-boot__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #c7d2fe;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: page-boot-spin 0.75s linear infinite;
}
.page-boot__text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #4338ca;
}
@keyframes page-boot-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
