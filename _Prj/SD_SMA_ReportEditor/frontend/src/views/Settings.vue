<template>
  <div class="page">
    <h2 class="page-title">设置</h2>
    <EnvironmentDiagnostics />
    <DataPathAndCacheSection />
    <MigrateLocalDataSection />
    <ConfigImportExport />
  </div>
</template>

<script setup>
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import DataPathAndCacheSection from '@/features/settings/data-path/DataPathAndCacheSection.vue'
import ConfigImportExport from '@/features/settings/config-import-export/ConfigImportExport.vue'
import MigrateLocalDataSection from '@/features/settings/migrate-local/MigrateLocalDataSection.vue'
</script>

<style scoped>
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}
</style>
