<template>
  <section class="settings-section">
    <h3 class="settings-section__title">操作审计</h3>
    <p class="settings-hint">
      记录本机关键操作（配置变更、导出、写回 PLC、演示与更新等），便于现场追溯。不含 OPC 树浏览等只读操作。
    </p>

    <div class="audit-toolbar">
      <label class="audit-filter">
        <span>类型</span>
        <select v-model="actionFilter" class="settings-select" @change="reload">
          <option value="">全部</option>
          <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
        </select>
      </label>
      <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="reload">
        刷新
      </button>
      <button type="button" class="settings-btn settings-btn--secondary" :disabled="busy" @click="exportJson">
        导出 JSON
      </button>
    </div>

    <p v-if="!entries.length && !busy" class="settings-hint">暂无审计记录。</p>

    <div v-if="entries.length" class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>结果</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="audit-ts">{{ formatAuditTime(e.ts) }}</td>
            <td><code>{{ e.action }}</code></td>
            <td :class="e.result === 'ok' ? 'audit-ok' : 'audit-fail'">{{ e.result }}</td>
            <td class="audit-summary">{{ e.summary || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="settings-hint settings-hint--muted">共 {{ total }} 条，显示最近 {{ entries.length }} 条</p>
    </div>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }"
    >
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { auditLog, exportAuditJson, fetchAuditEntries, formatAuditTime, type AuditEntry } from "@/lib/auditLog";

const busy = ref(false);
const msg = ref("");
const msgTone = ref("");
const entries = ref<AuditEntry[]>([]);
const total = ref(0);
const actionFilter = ref("");

const actionOptions = [
  "demo.apply_connections",
  "demo.health_check",
  "demo.pack_install",
  "demo.config_save",
  "config.export",
  "config.import",
  "export.pdf_manual",
  "export.opc_writeback",
  "export.opc_test_write",
  "app.update.check",
  "app.update.install",
];

function setMsg(text: string, tone: string) {
  msg.value = text;
  msgTone.value = tone;
}

async function reload() {
  busy.value = true;
  setMsg("", "");
  try {
    const res = await fetchAuditEntries({
      limit: 100,
      offset: 0,
      action: actionFilter.value || undefined,
    });
    entries.value = res.entries || [];
    total.value = res.total || 0;
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

async function exportJson() {
  busy.value = true;
  try {
    const res = await exportAuditJson(actionFilter.value || undefined);
    const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-editor-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`已导出 ${res.entries.length} 条记录。`, "ok");
    void auditLog({ action: "audit.export", summary: `导出 ${res.entries.length} 条` });
  } catch (e: unknown) {
    setMsg(e instanceof Error ? e.message : String(e), "err");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>

<style scoped>
.audit-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 12px;
}
.audit-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.audit-table-wrap {
  overflow-x: auto;
  max-width: 100%;
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.audit-table th,
.audit-table td {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.audit-table th {
  background: #f9fafb;
  font-weight: 600;
}
.audit-ts {
  white-space: nowrap;
  color: #6b7280;
}
.audit-summary {
  word-break: break-word;
  max-width: 360px;
}
.audit-ok {
  color: #059669;
  font-weight: 600;
}
.audit-fail {
  color: #dc2626;
  font-weight: 600;
}
.audit-table code {
  font-size: 12px;
}
</style>
