<template>
  <div class="main-layout-root">
    <div class="main-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="logo">报表编辑器</h1>
        </div>
        <nav class="sidebar-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="['nav-item', { 'nav-item--active': navActive(item.path) }]"
          >
            <span class="nav-icon-wrap">
              <span class="nav-icon">{{ item.icon }}</span>
              <span
                v-if="item.path === '/datasource' && dbHasFailedConnections"
                class="nav-badge"
                title="存在连接失败的数据库"
                aria-label="存在连接失败的数据库"
              />
              <span
                v-if="item.path === '/settings' && appUpdateAvailable"
                class="nav-badge"
                title="有新版本可更新"
                aria-label="有新版本可更新"
              />
            </span>
            <span class="nav-label">{{ item.label }}</span>
          </router-link>
        </nav>
      </aside>
      <main class="content">
        <div class="content-scroll">
          <router-view />
        </div>
      </main>
    </div>
    <SetupWizard v-model="setupWizardVisible" />
    <AppUpdatePromptDialog v-if="appUpdateStartupPromptOpen" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide, watch } from 'vue'
import { useRoute } from 'vue-router'
import SetupWizard from '@/features/onboarding/SetupWizard.vue'
import AppUpdatePromptDialog from '@/features/settings/app-update/AppUpdatePromptDialog.vue'
import {
  appUpdateAvailable,
  appUpdateStartupPromptOpen,
  disposeAppUpdateListeners,
  initAppUpdateListeners,
  runAutoUpdateCheck,
} from '@/features/settings/app-update/appUpdateState'
import { setupWizardCompleted } from '@/features/onboarding/setupWizardStorage'
import {
  dbHasFailedConnections,
  probeAllDatabaseConnectionsForNav,
} from '@/features/datasource/database-connection-health'

const route = useRoute()

const setupWizardVisible = ref(false)

/** 离开数据源页时由主导航轮询；在页内由工作台探测并更新同一状态，避免重复请求 */
const NAV_DB_HEALTH_POLL_MS = 5000
let navDbHealthTimer = null

function startNavDbHealthPolling() {
  stopNavDbHealthPolling()
  if (route.path.startsWith('/datasource')) return
  void probeAllDatabaseConnectionsForNav()
  navDbHealthTimer = window.setInterval(() => {
    if (!route.path.startsWith('/datasource')) {
      void probeAllDatabaseConnectionsForNav()
    }
  }, NAV_DB_HEALTH_POLL_MS)
}

function stopNavDbHealthPolling() {
  if (navDbHealthTimer != null) {
    window.clearInterval(navDbHealthTimer)
    navDbHealthTimer = null
  }
}

function onConfigImported() {
  if (!route.path.startsWith('/datasource')) {
    void probeAllDatabaseConnectionsForNav()
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
  startNavDbHealthPolling()
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onUnmounted(() => {
  stopNavDbHealthPolling()
  disposeAppUpdateListeners()
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})

provide('openSetupWizard', () => {
  setupWizardVisible.value = true
})

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
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: #a0a0b8;
  font-size: 14px;
  transition: all 0.2s;
  border-left: 3px solid transparent;
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
  border: 2px solid #1a1a2e;
  box-sizing: content-box;
  pointer-events: none;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: 32px;
  overflow: hidden;
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
.content-scroll > .page-fill-height {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
</style>
