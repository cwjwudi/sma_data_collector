<template>
  <div class="page">
    <h2 class="page-title">仪表盘</h2>
    <DashboardConnectionHealth />
    <div class="card-grid">
      <router-link to="/datasource" class="quick-card">
        <span class="quick-icon">🔌</span>
        <span class="quick-label">数据源配置</span>
      </router-link>
      <router-link to="/templates" class="quick-card">
        <span class="quick-icon">📄</span>
        <span class="quick-label">模板管理</span>
      </router-link>
      <router-link to="/layouts" class="quick-card">
        <span class="quick-icon">📐</span>
        <span class="quick-label">版式与页眉页脚</span>
      </router-link>
      <router-link to="/signatures" class="quick-card">
        <span class="quick-icon">✒️</span>
        <span class="quick-label">签名库</span>
      </router-link>
      <router-link to="/generate" class="quick-card">
        <span class="quick-icon">⚡</span>
        <span class="quick-label">生成报表</span>
      </router-link>
      <router-link to="/history" class="quick-card">
        <span class="quick-icon">📁</span>
        <span class="quick-label">历史报表</span>
      </router-link>
      <router-link to="/audit" class="quick-card">
        <span class="quick-icon">📋</span>
        <span class="quick-label">操作审计</span>
      </router-link>
      <router-link to="/settings" class="quick-card">
        <span class="quick-icon">⚙</span>
        <span class="quick-label">设置</span>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import DashboardConnectionHealth from '@/features/dashboard/DashboardConnectionHealth.vue'
</script>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
  cursor: pointer;
}

.quick-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.quick-icon {
  font-size: 36px;
}

.quick-label {
  font-size: 14px;
  font-weight: 500;
  color: #444;
}
</style>
