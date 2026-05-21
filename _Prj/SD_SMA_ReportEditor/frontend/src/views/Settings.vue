<template>
  <div class="page settings-page">
    <h2 class="page-title">设置</h2>
    <section class="settings-section settings-section--featured">
      <h3 class="settings-section__title">快速入门</h3>
      <p class="settings-hint">
        可再次打开首次使用的引导窗口，按步骤检查软件运行、连接数据库或现场数据。
      </p>
      <button type="button" class="settings-btn settings-btn--primary" @click="openSetupWizard">
        打开快速入门
      </button>
    </section>
    <EnvironmentDiagnostics />
    <AppUpdateSection />
    <LayoutCloudSyncSection />
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
import AppUpdateSection from '@/features/settings/app-update/AppUpdateSection.vue'
import LayoutCloudSyncSection from '@/features/settings/layout-cloud-sync/LayoutCloudSyncSection.vue'
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
