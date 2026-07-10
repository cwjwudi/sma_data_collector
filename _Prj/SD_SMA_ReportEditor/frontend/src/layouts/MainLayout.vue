<template>
  <div class="main-layout-root">
    <div class="main-layout">
      <aside class="sidebar" :class="{ 'sidebar--collapsed': sidebarCollapsed }">
        <div class="sidebar-header">
          <button
            type="button"
            class="sidebar-toggle"
            :aria-expanded="!sidebarCollapsed"
            :aria-label="sidebarCollapsed ? '展开导航栏' : '收起导航栏'"
            :title="sidebarCollapsed ? '展开导航栏' : '收起导航栏'"
            @click="toggleSidebarCollapsed"
          >
            <span class="sidebar-toggle__icon" aria-hidden="true">{{ sidebarCollapsed ? '»' : '«' }}</span>
          </button>
          <h1 v-if="!sidebarCollapsed" class="logo">
            报表编辑器<span v-if="appVersion" class="logo-version">{{ appVersion }}</span>
          </h1>
          <p
            v-else-if="appVersion"
            class="logo-version-only"
            :title="`报表编辑器 ${appVersion}`"
          >
            {{ appVersion }}
          </p>
        </div>
        <nav class="sidebar-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="['nav-item', { 'nav-item--active': navActive(item.path) }]"
            :title="sidebarCollapsed ? item.label : undefined"
            @click="onNavClick($event, item)"
          >
            <span class="nav-icon-wrap">
              <span class="nav-icon">{{ item.icon }}</span>
              <span
                v-if="item.path === '/datasource' && hasConnectionFailures"
                class="nav-badge"
                title="存在连接失败的连接"
                aria-label="存在连接失败的连接"
              />
              <span
                v-if="item.path === '/settings' && appUpdateAvailable"
                class="nav-badge"
                title="有新版本可更新"
                aria-label="有新版本可更新"
              />
            </span>
            <span v-show="!sidebarCollapsed" class="nav-label">{{ item.label }}</span>
          </router-link>
        </nav>
        <SidebarAppUpdateBar :collapsed="sidebarCollapsed" />
      </aside>
      <main class="content">
        <div
          v-if="routeTransitionPending"
          class="route-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div class="route-loading__bar" aria-hidden="true">
            <div class="route-loading__indeterminate" />
          </div>
          <p class="route-loading__text">{{ routeLoadingLabel }}</p>
        </div>
        <div class="content-scroll">
          <router-view v-slot="{ Component }">
            <keep-alive
              :include="[
                'Dashboard',
                'DataSourceConfig',
                'TemplateManager',
                'LayoutPresets',
                'SignaturesLibrary',
                'ReportGenerator',
                'ReportHistory',
                'AiTools',
                'Settings',
              ]"
            >
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </div>
      </main>
    </div>
    <SetupWizard v-model="setupWizardVisible" />
    <AppUpdatePromptDialog v-if="appUpdateStartupPromptOpen" />
    <AppConfirmDialog />
    <AppToastStack />
    <AiDrawer />
    <AiPendingPromptDialog />
  </div>
</template>

<script setup>
import AiDrawer from '@/features/ai-assistant/AiDrawer.vue'
import AiPendingPromptDialog from '@/features/ai-assistant/AiPendingPromptDialog.vue'
import { ref, nextTick, onMounted, onUnmounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SetupWizard from '@/features/onboarding/SetupWizard.vue'
import AppUpdatePromptDialog from '@/features/settings/app-update/AppUpdatePromptDialog.vue'
import SidebarAppUpdateBar from '@/features/settings/app-update/SidebarAppUpdateBar.vue'
import AppConfirmDialog from '@/components/AppConfirmDialog.vue'
import AppToastStack from '@/components/AppToastStack.vue'
import {
  appUpdateAvailable,
  appUpdateStartupPromptOpen,
  auditAppVersionChangeOnce,
  disposeAppUpdateListeners,
  initAppUpdateListeners,
  loadAppCurrentVersion,
  runAutoUpdateCheck,
} from '@/features/settings/app-update/appUpdateState'
import { setupWizardCompleted } from '@/features/onboarding/setupWizardStorage'
import {
  probeAllConnectionsForNav,
  hasFailedConnections,
} from '@/features/datasource/datasource-nav-health'
import {
  connectionProbeIntervalMs,
  loadConnectionProbePrefs,
} from '@/features/datasource/connection-probe-prefs'
import {
  disposeReportAutoExportTrigger,
  initReportAutoExportTrigger,
  invalidateTemplateSummariesCache,
} from '@/lib/report-auto-export-trigger-service'
import { disposePlcHeartbeat, initPlcHeartbeat } from '@/lib/plc-heartbeat-service'
import { loadSidebarCollapsed, saveSidebarCollapsed } from '@/lib/sidebar-layout-prefs'
import { prefetchCoreCatalog } from '@/lib/prefetch-core'
import sidebarFlurryUrl from '@/assets/backgrounds/sidebar-flurry.svg'
import contentFluxUrl from '@/assets/backgrounds/content-flux.svg'

const sidebarBgImage = `url("${sidebarFlurryUrl}")`
const contentBgImage = `url("${contentFluxUrl}")`

const route = useRoute()
const router = useRouter()

const setupWizardVisible = ref(false)
const appVersion = ref('')
const sidebarCollapsed = ref(loadSidebarCollapsed())
/** 侧栏切换路由时的全局加载提示（先绘制再跳转，避免「点了没反应」） */
const routeTransitionPending = ref(false)
const routeLoadingLabel = ref('正在加载页面…')

let routeShowTimer = null
let routeHideTimer = null
let removeBeforeEach = null
let removeAfterEach = null
let removeOnError = null

function clearRouteLoadingTimers() {
  if (routeShowTimer != null) {
    window.clearTimeout(routeShowTimer)
    routeShowTimer = null
  }
  if (routeHideTimer != null) {
    window.clearTimeout(routeHideTimer)
    routeHideTimer = null
  }
}

function labelForRoutePath(path) {
  if (path.startsWith('/datasource')) return '正在打开数据源配置…'
  if (path.startsWith('/editor')) return '正在打开模版编辑器…'
  if (path.startsWith('/templates')) return '正在打开模板管理…'
  if (path.startsWith('/layouts')) return '正在打开版式与页眉页脚…'
  if (path.startsWith('/signatures')) return '正在打开签名库…'
  if (path.startsWith('/generate')) return '正在打开生成报表…'
  if (path.startsWith('/history')) return '正在打开历史报表…'
  if (path.startsWith('/audit')) return '正在打开操作审计…'
  if (path.startsWith('/settings')) return '正在打开设置…'
  if (path === '/' || path === '') return '正在打开仪表盘…'
  return '正在加载页面…'
}

function beginRouteLoading(path, { immediate = false } = {}) {
  clearRouteLoadingTimers()
  routeLoadingLabel.value = labelForRoutePath(path)
  if (immediate || path.startsWith('/datasource') || path.startsWith('/editor')) {
    routeTransitionPending.value = true
    return
  }
  routeShowTimer = window.setTimeout(() => {
    routeTransitionPending.value = true
    routeShowTimer = null
  }, 120)
}

function endRouteLoading() {
  clearRouteLoadingTimers()
  routeHideTimer = window.setTimeout(() => {
    routeTransitionPending.value = false
    routeHideTimer = null
  }, 60)
}

/** 先让加载条完成一帧绘制，再执行路由跳转，减轻大 chunk 解析时的「假死」感 */
async function onNavClick(e, item) {
  const targetPath = item.path
  if (navActive(targetPath) && route.path === targetPath) return
  e.preventDefault()
  beginRouteLoading(targetPath, { immediate: true })
  await nextTick()
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
  try {
    await router.push(targetPath)
  } catch (err) {
    routeTransitionPending.value = false
    throw err
  }
}

function toggleSidebarCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  saveSidebarCollapsed(sidebarCollapsed.value)
}

async function loadAppVersion() {
  const v = await loadAppCurrentVersion()
  appVersion.value = v
}

/** 离开数据源页时由主导航轮询；在页内由工作台探测并更新同一状态，避免重复请求 */
let navDbHealthTimer = null
let navProbePrefs = { enabled: false, intervalSec: 30 }

const hasConnectionFailures = hasFailedConnections

function stopNavDbHealthPolling() {
  if (navDbHealthTimer != null) {
    window.clearInterval(navDbHealthTimer)
    navDbHealthTimer = null
  }
}

function startNavDbHealthPolling() {
  stopNavDbHealthPolling()
  if (route.path.startsWith('/datasource') || !navProbePrefs.enabled) return
  void probeAllConnectionsForNav()
  navDbHealthTimer = window.setInterval(() => {
    if (!route.path.startsWith('/datasource') && navProbePrefs.enabled) {
      void probeAllConnectionsForNav()
    }
  }, connectionProbeIntervalMs(navProbePrefs))
}

async function reloadNavProbePrefs() {
  navProbePrefs = await loadConnectionProbePrefs()
  startNavDbHealthPolling()
}

function onProbePrefsChanged(ev) {
  if (ev?.detail) {
    navProbePrefs = ev.detail
    startNavDbHealthPolling()
    return
  }
  void reloadNavProbePrefs()
}

function onConfigImported() {
  invalidateTemplateSummariesCache()
  if (!route.path.startsWith('/datasource')) {
    void probeAllConnectionsForNav()
  }
}

watch(
  () => route.path,
  () => {
    startNavDbHealthPolling()
  },
)

function scheduleAutoUpdateCheck() {
  window.setTimeout(() => {
    void runAutoUpdateCheck()
  }, 1500)
}

onMounted(() => {
  removeBeforeEach = router.beforeEach((to, from) => {
    if (to.path === from.path) return
    beginRouteLoading(to.path)
  })
  removeAfterEach = router.afterEach(() => {
    endRouteLoading()
  })
  removeOnError = router.onError(() => {
    clearRouteLoadingTimers()
    routeTransitionPending.value = false
  })
  void loadAppVersion()
  void auditAppVersionChangeOnce()
  initAppUpdateListeners()
  if (!setupWizardCompleted()) {
    setupWizardVisible.value = true
    watch(
      setupWizardVisible,
      (visible) => {
        if (!visible) scheduleAutoUpdateCheck()
      },
      { once: true },
    )
  } else {
    scheduleAutoUpdateCheck()
  }
  void reloadNavProbePrefs()
  initReportAutoExportTrigger()
  initPlcHeartbeat()
  prefetchCoreCatalog()
  window.addEventListener('report-editor-config-imported', onConfigImported)
  window.addEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
})

onUnmounted(() => {
  clearRouteLoadingTimers()
  removeBeforeEach?.()
  removeAfterEach?.()
  removeOnError?.()
  stopNavDbHealthPolling()
  disposeReportAutoExportTrigger()
  disposePlcHeartbeat()
  disposeAppUpdateListeners()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
  window.removeEventListener('report-editor-connection-probe-changed', onProbePrefsChanged)
})

provide('openSetupWizard', () => {
  setupWizardVisible.value = true
})

provide('sidebarCollapsed', sidebarCollapsed)

/** 侧边栏「版式与页眉页脚」在列表与编辑页同时高亮 */
function navActive(path) {
  const p = route.path
  if (path === '/') return p === '/' || p === ''
  if (path === '/layouts') return p.startsWith('/layouts')
  return p === path || p.startsWith(path + '/')
}

const navItems = [
  { path: '/', icon: '📊', label: '仪表盘' },
  { path: '/datasource', icon: '🔌', label: '数据源配置' },
  { path: '/templates', icon: '📄', label: '模板管理' },
  { path: '/layouts', icon: '📐', label: '版式与页眉页脚' },
  { path: '/signatures', icon: '✒️', label: '签名库' },
  { path: '/generate', icon: '⚡', label: '生成报表' },
  { path: '/history', icon: '📁', label: '历史报表' },
  { path: '/audit', icon: '📋', label: '操作审计' },
  { path: '/ai-tools', icon: '🤖', label: 'AI 工具' },
  { path: '/settings', icon: '⚙', label: '设置' },
]
</script>

<style scoped>
.main-layout-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.sidebar {
  width: 220px;
  background-color: hsl(238, 82%, 13%);
  background-image: v-bind(sidebarBgImage);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.sidebar--collapsed {
  width: 64px;
}

.sidebar-header {
  position: relative;
  padding: 20px 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.sidebar--collapsed .sidebar-header {
  padding: 16px 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.sidebar-toggle {
  position: absolute;
  top: 12px;
  right: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.sidebar--collapsed .sidebar-toggle {
  position: static;
  width: 32px;
  height: 32px;
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
}

.sidebar-toggle__icon {
  font-size: 14px;
  line-height: 1;
  font-weight: 700;
}

.logo {
  margin: 0;
  padding-right: 32px;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  line-height: 1.35;
}

.logo-version {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

.logo-version-only {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #94a3b8;
  text-align: center;
  line-height: 1.2;
  word-break: break-all;
}

.sidebar-nav {
  flex: 1;
  min-height: 0;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.sidebar--collapsed .sidebar-nav {
  padding: 8px 0;
  align-items: center;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: #a0a0b8;
  font-size: 14px;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  border-left: 3px solid transparent;
}

.sidebar--collapsed .nav-item {
  justify-content: center;
  gap: 0;
  width: 48px;
  margin: 0 auto;
  padding: 10px 0;
  border-left: none;
  border-radius: 8px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
}

.nav-item--active {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border-left-color: #818cf8;
}

.sidebar--collapsed .nav-item--active {
  border-left-color: transparent;
  background: rgba(99, 102, 241, 0.28);
}

.nav-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.nav-icon-wrap {
  position: relative;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-badge {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid hsl(238, 82%, 13%);
  box-sizing: content-box;
  pointer-events: none;
}

.sidebar--collapsed .nav-badge {
  border-color: hsl(238, 82%, 13%);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: 32px;
  overflow: hidden;
  position: relative;
  background-color: hsl(227, 45%, 72%);
  background-image: v-bind(contentBgImage);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.route-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 8px;
}

.route-loading__bar {
  height: 3px;
  width: 100%;
  overflow: hidden;
  background: rgba(99, 102, 241, 0.12);
}

.route-loading__indeterminate {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1);
  border-radius: 0 2px 2px 0;
  animation: route-loading-slide 0.9s ease-in-out infinite;
}

.route-loading__text {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 500;
  color: #4f46e5;
  line-height: 1.3;
}

@keyframes route-loading-slide {
  0% {
    transform: translateX(-30%);
  }
  100% {
    transform: translateX(280%);
  }
}

/* 仅内层滚动：padding 留在外层；子项横向拉满并与「含 padding 的 main」可视宽度对齐 */
.content-scroll {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.content-scroll > * {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
/** 路由页根节点加类名后占满主区竖向高度（内部再分区滚动，避免整页一条长滚动条） */
.content-scroll > .page-fill-height,
.content-scroll > .page-fill {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
</style>
