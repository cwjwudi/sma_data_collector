<template>
  <div class="page">
    <h2 class="page-title">仪表盘</h2>
    <DashboardConnectionHealth />
    <DashboardFieldOps />
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
import DashboardFieldOps from '@/features/dashboard/DashboardFieldOps.vue'

defineOptions({ name: 'Dashboard' })
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
  background: rgb(255 255 255 / 0.92);
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.05);
  transition: all 0.2s;
  cursor: pointer;
}

.quick-card:hover {
  box-shadow: 0 10px 28px rgb(15 23 42 / 0.1);
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
