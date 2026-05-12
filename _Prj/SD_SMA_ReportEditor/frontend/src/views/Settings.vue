<template>
  <div class="page">
    <h2 class="page-title">设置</h2>
    <EnvironmentDiagnostics />
    <section class="card muted-card">
      <h3>数据与路径</h3>
      <p class="muted">后端数据目录由运行环境决定（开发：backend/data；Electron：用户目录 backend-data）。详见 README。</p>
    </section>
    <ConfigImportExportPlaceholder />
  </div>
</template>

<script setup>
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import ConfigImportExportPlaceholder from '@/features/settings/config-import-export/ConfigImportExportPlaceholder.vue'
</script>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}
.muted-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  margin-top: 16px;
}
.muted {
  color: #6b7280;
  font-size: 13px;
}
</style>
