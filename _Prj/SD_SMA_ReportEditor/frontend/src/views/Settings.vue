<template>
  <div class="page settings-page">
    <h2 class="page-title">设置</h2>
    <section class="settings-section settings-section--featured">
      <h3 class="settings-section__title">首次配置向导</h3>
      <p class="settings-hint">
        若您认为功能入口偏多，可随时重新打开向导，按顺序检查环境或连接数据源。
      </p>
      <button type="button" class="settings-btn settings-btn--primary" @click="openSetupWizard">
        打开首次配置向导
      </button>
    </section>
    <EnvironmentDiagnostics />
    <DataPathAndCacheSection />
    <MigrateLocalDataSection />
    <ConfigImportExport />
    <ElectronDevtoolsSection />
  </div>
</template>

<script setup>
import { inject } from 'vue'
import ElectronDevtoolsSection from '@/features/settings/electron-devtools/ElectronDevtoolsSection.vue'
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import DataPathAndCacheSection from '@/features/settings/data-path/DataPathAndCacheSection.vue'
import ConfigImportExport from '@/features/settings/config-import-export/ConfigImportExport.vue'
import MigrateLocalDataSection from '@/features/settings/migrate-local/MigrateLocalDataSection.vue'

const openSetupWizard = inject('openSetupWizard', () => {})
</script>

<style scoped>
.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 16px;
  letter-spacing: -0.02em;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';

.page.settings-page > .settings-section--featured {
  margin-bottom: 24px;
}
</style>
