<template>
  <div class="page">
    <h2 class="page-title">设置</h2>
    <section class="wiz-card">
      <h3 class="wiz-card-title">首次配置向导</h3>
      <p class="wiz-card-hint">若您认为功能入口偏多，可随时重新打开向导，按顺序检查环境或连接数据源。</p>
      <button type="button" class="wiz-open-btn" @click="openSetupWizard">打开首次配置向导</button>
    </section>
    <EnvironmentDiagnostics />
    <DataPathAndCacheSection />
    <MigrateLocalDataSection />
    <ConfigImportExport />
  </div>
</template>

<script setup>
import { inject } from 'vue'
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import DataPathAndCacheSection from '@/features/settings/data-path/DataPathAndCacheSection.vue'
import ConfigImportExport from '@/features/settings/config-import-export/ConfigImportExport.vue'
import MigrateLocalDataSection from '@/features/settings/migrate-local/MigrateLocalDataSection.vue'

const openSetupWizard = inject('openSetupWizard', () => {})
</script>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}

.wiz-card {
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 24px;
  background: linear-gradient(180deg, #eef2ff 0%, #fff 72%);
}

.wiz-card-title {
  font-size: 17px;
  margin-bottom: 8px;
  color: #1e1b4b;
}

.wiz-card-hint {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 12px;
  line-height: 1.45;
}

.wiz-open-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid #4f46e5;
  background: #4f46e5;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.wiz-open-btn:hover {
  background: #4338ca;
  border-color: #4338ca;
}
</style>
