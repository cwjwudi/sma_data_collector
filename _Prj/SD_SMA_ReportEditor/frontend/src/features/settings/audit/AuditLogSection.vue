<template>
  <section class="settings-section">
    <p class="settings-hint">
      记录本机关键操作（配置变更、导出、写回 PLC、演示与更新等），便于现场追溯。不含 OPC 树浏览等只读操作。
      默认保留最近 90 天、最多 5000 条。导出失败时会写入绑定/表名/SQL 等诊断字段，可点开行查看。
    </p>

    <div class="audit-filters">
      <label class="audit-filter">
        <span class="settings-field-label">类型</span>
        <select v-model="actionFilter" class="settings-select audit-filter-select">
          <option value="">全部</option>
          <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
        </select>
      </label>
      <label class="audit-filter">
        <span class="settings-field-label">结果</span>
        <select v-model="resultFilter" class="settings-select audit-filter-select">
          <option value="">全部</option>
          <option value="ok">ok</option>
          <option value="fail">fail</option>
        </select>
      </label>
      <label class="audit-filter">
        <span class="settings-field-label">起始日期</span>
        <input v-model="fromDate" type="date" class="settings-input audit-date-input" />
      </label>
      <label class="audit-filter">
        <span class="settings-field-label">截止日期</span>
        <input v-model="toDate" type="date" class="settings-input audit-date-input" />
      </label>
    </div>

    <div class="settings-actions audit-toolbar">
      <button type="button" class="settings-btn" :disabled="busy" @click="reload">
        刷新
      </button>
      <button type="button" class="settings-btn" :disabled="busy" @click="exportJson">
        导出 JSON
      </button>
      <button type="button" class="settings-btn" :disabled="busy" @click="exportCsv">
        导出 CSV
      </button>
    </div>

    <p v-if="!entries.length && !busy" class="settings-hint">暂无审计记录。</p>

    <div v-if="entries.length" class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th class="audit-col-expand" />
            <th>时间</th>
            <th>操作</th>
            <th>结果</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="e in entries" :key="e.id">
            <tr
              class="audit-row"
              :class="{ 'audit-row--open': expandedId === e.id, 'audit-row--clickable': hasDetail(e) }"
              @click="toggleExpand(e)"
            >
              <td class="audit-col-expand">
                <span v-if="hasDetail(e)" class="audit-caret" aria-hidden="true">{{
                  expandedId === e.id ? "▾" : "▸"
                }}</span>
              </td>
              <td class="audit-ts">{{ formatAuditTime(e.ts) }}</td>
              <td><code>{{ e.action }}</code></td>
              <td :class="e.result === 'ok' ? 'audit-ok' : 'audit-fail'">{{ e.result }}</td>
              <td class="audit-summary">{{ e.summary || "—" }}</td>
            </tr>
            <tr v-if="expandedId === e.id && hasDetail(e)" class="audit-detail-row">
              <td colspan="5" class="audit-detail-cell">
                <div v-if="e.object_id" class="audit-detail-meta">
                  对象：{{ e.object_type || "—" }} / <code>{{ e.object_id }}</code>
                </div>
                <pre class="audit-detail-pre">{{ formatDetail(e) }}</pre>
              </td>
            </tr>
          </template>
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
import {
  auditLog,
  dateInputToFromTs,
  dateInputToToTs,
  exportAuditCsv,
  exportAuditJson,
  fetchAuditEntries,
  formatAuditTime,
  type AuditEntry,
} from "@/lib/auditLog";

const busy = ref(false);
const msg = ref("");
const msgTone = ref("");
const entries = ref<AuditEntry[]>([]);
const total = ref(0);
const actionFilter = ref("");
const resultFilter = ref("");
const fromDate = ref("");
const toDate = ref("");
const expandedId = ref("");

const actionOptions = [
  "config.export",
  "config.import",
  "config.reset",
  "db.connection_save",
  "db.connection_delete",
  "opcua.connection_save",
  "opcua.connection_delete",
  "datasource.lock",
  "datasource.unlock",
  "datasource.write_blocked",
  "datasource.probe_settings",
  "demo.apply_connections",
  "demo.health_check",
  "demo.pack_install",
  "demo.compose_start",
  "demo.compose_stop",
  "export.batch_trigger",
  "export.auto_pdf",
  "export.manual_pdf",
  "export.opc_writeback",
  "export.opc_writeback_test",
  "update.check",
  "update.install",
  "update.applied",
  "update.download_installer",
  "audit.export",
];

function setMsg(text: string, tone: string) {
  msg.value = text;
  msgTone.value = tone;
}

function currentQuery() {
  return {
    action: actionFilter.value || undefined,
    result: resultFilter.value || undefined,
    fromTs: dateInputToFromTs(fromDate.value),
    toTs: dateInputToToTs(toDate.value),
  };
}

function hasDetail(e: AuditEntry): boolean {
  const d = e.detail;
  if (!d || typeof d !== "object") return false;
  return Object.keys(d).length > 0;
}

function toggleExpand(e: AuditEntry) {
  if (!hasDetail(e)) return;
  expandedId.value = expandedId.value === e.id ? "" : e.id;
}

function formatDetail(e: AuditEntry): string {
  const d = e.detail || {};
  try {
    return JSON.stringify(d, null, 2);
  } catch {
    return String(d);
  }
}

async function reload() {
  busy.value = true;
  setMsg("", "");
  expandedId.value = "";
  try {
    const res = await fetchAuditEntries({
      limit: 100,
      offset: 0,
      ...currentQuery(),
    });
    entries.value = res.entries || [];
    total.value = res.total || 0;
  } catch (err: unknown) {
    setMsg(err instanceof Error ? err.message : String(err), "err");
  } finally {
    busy.value = false;
  }
}

async function exportJson() {
  busy.value = true;
  try {
    const res = await exportAuditJson(currentQuery());
    const blob = new Blob([JSON.stringify(res.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-editor-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`已导出 ${res.entries.length} 条记录。`, "ok");
    void auditLog({ action: "audit.export", summary: `JSON ${res.entries.length} 条` });
  } catch (err: unknown) {
    setMsg(err instanceof Error ? err.message : String(err), "err");
  } finally {
    busy.value = false;
  }
}

async function exportCsv() {
  busy.value = true;
  try {
    const csv = await exportAuditCsv(currentQuery());
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-editor-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const lines = csv.trim().split("\n").length;
    const count = Math.max(0, lines - 1);
    setMsg(`已导出 ${count} 条记录（CSV）。`, "ok");
    void auditLog({ action: "audit.export", summary: `CSV ${count} 条` });
  } catch (err: unknown) {
    setMsg(err instanceof Error ? err.message : String(err), "err");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>

<style scoped>
.audit-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.audit-toolbar {
  align-items: flex-end;
  margin-bottom: 12px;
}

.audit-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.audit-filter-select,
.audit-date-input {
  max-width: none;
  width: 100%;
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

.audit-col-expand {
  width: 28px;
  padding-left: 6px;
  padding-right: 4px;
}

.audit-caret {
  color: #6b7280;
  font-size: 12px;
}

.audit-row--clickable {
  cursor: pointer;
}

.audit-row--clickable:hover {
  background: #f8fafc;
}

.audit-row--open {
  background: #f1f5f9;
}

.audit-detail-row td {
  background: #f8fafc;
}

.audit-detail-cell {
  padding: 10px 12px 14px !important;
}

.audit-detail-meta {
  margin-bottom: 8px;
  font-size: 12px;
  color: #64748b;
}

.audit-detail-pre {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.audit-ts {
  white-space: nowrap;
  color: #6b7280;
}

.audit-summary {
  word-break: break-word;
  max-width: 420px;
  white-space: pre-wrap;
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
