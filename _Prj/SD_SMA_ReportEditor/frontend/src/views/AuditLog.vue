<template>
  <div class="page audit-log-page">
    <h2 class="page-title">操作审计</h2>
    <AuditLogSection />
  </div>
</template>

<script setup lang="ts">
import AuditLogSection from '@/features/settings/audit/AuditLogSection.vue'
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

.audit-log-page {
  max-width: 960px;
}
</style>
