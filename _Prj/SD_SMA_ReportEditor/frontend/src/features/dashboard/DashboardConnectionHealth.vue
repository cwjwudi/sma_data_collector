<template>
  <section v-if="summary.total > 0" class="dash-health" :class="{ 'dash-health--warn': summary.fail > 0 }">
    <div class="dash-health-head">
      <h3 class="dash-health-title">连接状态</h3>
      <router-link to="/datasource" class="dash-health-link">查看数据源 →</router-link>
    </div>
    <p class="dash-health-stats">
      数据库 <strong>{{ db.ok }}/{{ db.total }}</strong>
      <span v-if="db.fail" class="dash-health-fail">（{{ db.fail }} 异常）</span>
      · OPC UA <strong>{{ opc.ok }}/{{ opc.total }}</strong>
      <span v-if="opc.fail" class="dash-health-fail">（{{ opc.fail }} 异常）</span>
    </p>
    <button
      v-if="summary.fail > 0"
      type="button"
      class="dash-health-detail-btn"
      @click="detailOpen = true"
    >
      查看异常详情
    </button>
    <ConnectionHealthFailuresDialog v-model="detailOpen" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ConnectionHealthFailuresDialog from "@/features/datasource/ConnectionHealthFailuresDialog.vue";
import {
  connectionHealthCombined,
  dbConnectionHealth,
  opcHealthSummary,
  probeAllConnectionsForNav,
} from "@/features/datasource/datasource-nav-health";
import { loadConnectionProbePrefs } from "@/features/datasource/connection-probe-prefs";

const detailOpen = ref(false);

const db = computed(() => dbConnectionHealth.value);
const opc = computed(() => opcHealthSummary.value);
const summary = computed(() => connectionHealthCombined.value);

onMounted(async () => {
  void probeAllConnectionsForNav();
  const prefs = await loadConnectionProbePrefs();
  if (prefs.enabled) {
    void probeAllConnectionsForNav();
  }
});
</script>

<style scoped>
.dash-health {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.dash-health--warn {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fff7f7 0%, #fff 100%);
}

.dash-health-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.dash-health-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.dash-health-link {
  font-size: 13px;
  color: #4f46e5;
  text-decoration: none;
}

.dash-health-link:hover {
  text-decoration: underline;
}

.dash-health-stats {
  margin: 0;
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
}

.dash-health-fail {
  color: #dc2626;
  font-weight: 600;
}

.dash-health-detail-btn {
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.dash-health-detail-btn:hover {
  background: #f9fafb;
}
</style>
