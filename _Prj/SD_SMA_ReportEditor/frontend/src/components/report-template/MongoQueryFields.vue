<template>
  <div class="mqf">
    <label class="lpep-lab">
      MongoDB 连接
      <select :value="cfg.connectionId" class="lpep-inp" @change="onConnSelect">
        <option value="">选择连接…</option>
        <option v-for="c in mongoConnections" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>
    <label class="lpep-lab">
      数据库
      <input
        :value="cfg.database"
        class="lpep-inp"
        placeholder="database"
        spellcheck="false"
        @input="patch({ database: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label class="lpep-lab">
      集合
      <input
        :value="cfg.collection"
        class="lpep-inp"
        placeholder="collection"
        spellcheck="false"
        @input="patch({ collection: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <div class="mqf-mode" role="group" aria-label="查询模式">
      <button
        type="button"
        class="mqf-mode-btn"
        :class="{ 'mqf-mode-btn--on': cfg.mode === 'find' }"
        @click="patch({ mode: 'find' })"
      >
        find
      </button>
      <button
        type="button"
        class="mqf-mode-btn"
        :class="{ 'mqf-mode-btn--on': cfg.mode === 'aggregate' }"
        @click="patch({ mode: 'aggregate' })"
      >
        aggregate
      </button>
    </div>
    <label v-if="cfg.mode === 'find'" class="lpep-lab">
      filter（JSON，可用 p0 占位）
      <textarea
        :value="cfg.filterJson"
        rows="3"
        class="lpep-inp mqf-mono"
        spellcheck="false"
        @input="patch({ filterJson: ($event.target as HTMLTextAreaElement).value })"
      />
    </label>
    <label v-else class="lpep-lab">
      pipeline（JSON 数组）
      <textarea
        :value="cfg.pipelineJson"
        rows="4"
        class="lpep-inp mqf-mono"
        spellcheck="false"
        @input="patch({ pipelineJson: ($event.target as HTMLTextAreaElement).value })"
      />
    </label>
    <label class="lpep-lab">
      行数上限
      <input
        :value="cfg.limit"
        type="number"
        min="1"
        max="5000"
        class="lpep-inp"
        @change="onLimitChange"
      />
    </label>
    <label class="lpep-lab">
      取值字段（标量；空=首字段）
      <input
        :value="cfg.valueField"
        class="lpep-inp"
        placeholder="例如 amount"
        spellcheck="false"
        @input="patch({ valueField: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <p v-if="loadErr" class="mqf-err">{{ loadErr }}</p>
    <p v-else-if="!mongoConnections.length" class="lpep-hint-muted">暂无 MongoDB 连接，请先在数据源中添加。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { apiFetch } from "@/api/client.js";
import {
  defaultMongoQueryConfig,
  hydrateMongoQuery,
  type MongoQueryConfig,
} from "@/lib/report-template/mongo-query";

const props = defineProps<{
  modelValue: MongoQueryConfig | null | undefined;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: MongoQueryConfig];
}>();

const mongoConnections = ref<{ id: string; name: string; database?: string }[]>([]);
const loadErr = ref("");

const cfg = computed(() => hydrateMongoQuery(props.modelValue ?? defaultMongoQueryConfig()));

function patch(partial: Partial<MongoQueryConfig>) {
  emit("update:modelValue", { ...cfg.value, ...partial });
}

function onConnSelect(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value;
  const c = mongoConnections.value.find((x) => x.id === id);
  const next: Partial<MongoQueryConfig> = { connectionId: id };
  if (c?.database && !cfg.value.database.trim()) next.database = c.database;
  patch(next);
}

function onLimitChange(ev: Event) {
  const n = Math.round(Number((ev.target as HTMLInputElement).value));
  patch({ limit: Number.isFinite(n) ? Math.min(5000, Math.max(1, n)) : 200 });
}

watch(
  () => props.modelValue,
  (v) => {
    if (v == null) emit("update:modelValue", defaultMongoQueryConfig());
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    const data = await apiFetch("/database/connections");
    mongoConnections.value = (data.connections || [])
      .filter((c: { engine?: string }) => String(c.engine || "").toLowerCase() === "mongodb")
      .map((c: { id?: string; name?: string; database?: string }) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? c.id ?? ""),
        database: typeof c.database === "string" ? c.database : undefined,
      }));
  } catch (e) {
    loadErr.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<style scoped>
.mqf {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mqf-mode {
  display: flex;
  gap: 4px;
}
.mqf-mode-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  font-size: 12px;
  cursor: pointer;
}
.mqf-mode-btn--on {
  background: #eef2ff;
  border-color: #818cf8;
  font-weight: 600;
}
.mqf-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}
.mqf-err {
  margin: 0;
  font-size: 11px;
  color: #b91c1c;
}
.lpep-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
}
.lpep-inp {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
}
.lpep-hint-muted {
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.45;
}
</style>
