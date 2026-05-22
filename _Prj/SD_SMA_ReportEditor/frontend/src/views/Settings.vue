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
    <section class="settings-section">
      <h3 class="settings-section__title">关于电子签名</h3>
      <p class="settings-hint">
        本软件在模版与 PDF 导出中使用的是<strong>图像签章</strong>：将签名库中的手写 PNG 按模版位置打印进 PDF。
        这与 Adobe Acrobat 等阅读器中的<strong>数字证书电子签名</strong>（可在阅读器中验证证书链）不是同一类能力。
        若现场需要 PKCS#7 / 国密等可验证 PDF 签章，需另行评估专用方案。
      </p>
    </section>
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
