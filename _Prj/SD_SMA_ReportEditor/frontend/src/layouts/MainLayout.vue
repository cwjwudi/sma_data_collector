<template>
  <div class="main-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="logo">ReportEditor</h1>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="nav-item--active"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
const navItems = [
  { path: '/', icon: '📊', label: '仪表盘' },
  { path: '/datasource', icon: '🔌', label: '数据源配置' },
  { path: '/templates', icon: '📄', label: '模板管理' },
  { path: '/generate', icon: '⚡', label: '生成报表' },
  { path: '/history', icon: '📁', label: '历史报表' },
  { path: '/settings', icon: '⚙', label: '设置' },
]
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
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

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 32px;
}
.content > * {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
</style>
