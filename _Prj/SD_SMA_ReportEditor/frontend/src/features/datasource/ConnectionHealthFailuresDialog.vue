<template>
  <div v-if="modelValue" class="health-dialog-backdrop" @click.self="close">
    <div class="health-dialog" role="dialog" aria-labelledby="health-dialog-title">
      <header class="health-dialog-head">
        <h3 id="health-dialog-title">连接异常详情</h3>
        <button type="button" class="health-dialog-close" aria-label="关闭" @click="close">×</button>
      </header>
      <div v-if="loading" class="health-dialog-body">加载中…</div>
      <div v-else-if="!failures.length" class="health-dialog-body">当前没有异常连接。</div>
      <ul v-else class="health-fail-list">
        <li v-for="item in failures" :key="item.key" class="health-fail-item">
          <div class="health-fail-kind">{{ item.kind }}</div>
          <div class="health-fail-name">{{ item.name }}</div>
          <div class="health-fail-msg">{{ item.message || "连接失败" }}</div>
          <div v-if="item.checkedAt" class="health-fail-time">最后检测：{{ item.checkedAt }}</div>
        </li>
      </ul>
      <footer class="health-dialog-foot">
        <button type="button" class="settings-btn settings-btn--primary" @click="close">关闭</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { apiFetch } from "@/api/client.js";
import {
  getDbConnectionHealth,
  getOpcConnectionHealth,
} from "@/features/datasource/connection-health-detail";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

type FailureRow = {
  key: string;
  kind: string;
  name: string;
  message: string;
  checkedAt: string;
};

const loading = ref(false);
const failures = ref<FailureRow[]>([]);

function close() {
  emit("update:modelValue", false);
}

function formatCheckedAt(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

async function loadFailures() {
  loading.value = true;
  failures.value = [];
  try {
    const [dbData, opcData] = await Promise.all([
      apiFetch("/database/connections") as Promise<{ connections?: Array<{ id?: string; name?: string }> }>,
      apiFetch("/opcua/servers") as Promise<{ servers?: Array<{ id?: string; name?: string }> }>,
    ]);
    const rows: FailureRow[] = [];
    for (const c of dbData.connections || []) {
      const id = String(c.id || "");
      if (!id) continue;
      const rec = getDbConnectionHealth(id);
      if (rec.state !== "fail") continue;
      rows.push({
        key: `db-${id}`,
        kind: "数据库",
        name: String(c.name || id),
        message: rec.message,
        checkedAt: formatCheckedAt(rec.checkedAt),
      });
    }
    for (const s of opcData.servers || []) {
      const id = String(s.id || "");
      if (!id) continue;
      const rec = getOpcConnectionHealth(id);
      if (rec.state !== "fail") continue;
      rows.push({
        key: `opc-${id}`,
        kind: "OPC UA",
        name: String(s.name || id),
        message: rec.message,
        checkedAt: formatCheckedAt(rec.checkedAt),
      });
    }
    failures.value = rows;
  } catch {
    failures.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void loadFailures();
  },
);
</script>

<style scoped>
.health-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.health-dialog {
  width: min(520px, 100%);
  max-height: min(80vh, 640px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

.health-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
}

.health-dialog-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.health-dialog-close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}

.health-dialog-body {
  padding: 20px 18px;
  color: #6b7280;
  font-size: 14px;
}

.health-fail-list {
  list-style: none;
  margin: 0;
  padding: 12px 18px;
  overflow-y: auto;
  flex: 1;
}

.health-fail-item {
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}

.health-fail-item:last-child {
  border-bottom: none;
}

.health-fail-kind {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.health-fail-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.health-fail-msg {
  margin-top: 4px;
  font-size: 13px;
  color: #dc2626;
  line-height: 1.45;
  word-break: break-word;
}

.health-fail-time {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.health-dialog-foot {
  padding: 12px 18px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}
</style>
