<template>
  <div class="sspb">
    <div class="sspb-title">SQL 参数</div>
    <div v-for="slot in slots" :key="'sql-param-' + slot" class="sspb-row">
      <span class="sspb-token">{{ paramToken(slot) }}</span>
      <select
        v-model="params[slot].source"
        class="lpep-inp sspb-source"
        @change="onSourceChange(params[slot])"
      >
        <option value="literal">固定值</option>
        <option value="opcua">OPC UA</option>
        <option value="batch_no">结批批次号</option>
      </select>
      <input
        v-if="params[slot].source === 'literal'"
        v-model.trim="params[slot].literalFallback"
        class="lpep-inp sspb-value"
        placeholder="用于替换参数"
      />
      <template v-else-if="params[slot].source === 'batch_no'">
        <p class="sspb-batch-hint">{{ batchHint }}</p>
        <input
          v-model.trim="params[slot].literalFallback"
          class="lpep-inp sspb-fallback"
          placeholder="批次号 OPC 无值时的兜底"
        />
      </template>
      <template v-else>
        <input
          v-model.trim="params[slot].opcuaNodeId"
          class="lpep-inp sspb-node"
          placeholder="NodeId"
          spellcheck="false"
        />
        <button type="button" class="lpep-file-btn sspb-pick" @click="emit('opc-pick', slot)">选择</button>
        <input
          v-model.trim="params[slot].literalFallback"
          class="lpep-inp sspb-fallback"
          placeholder="兜底"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import {
  formatAutoBatchOpcBindingHint,
  resolveAutoBatchOpcBinding,
} from "@/lib/auto-batch-opc-binding";
import {
  defaultSqlParam,
  ensureSqlParamSlots,
  type TableSqlParamBinding,
} from "@/lib/report-template/table-sql-fill";

const props = withDefaults(
  defineProps<{
    params: TableSqlParamBinding[];
    slotCount?: number;
  }>(),
  { slotCount: 2 },
);

const emit = defineEmits<{
  "opc-pick": [slot: number];
}>();

const slots = computed(() =>
  Array.from({ length: Math.max(1, Math.min(8, props.slotCount)) }, (_, i) => i),
);

const batchHint = computed(() => formatAutoBatchOpcBindingHint(resolveAutoBatchOpcBinding()));

onMounted(() => {
  ensureSqlParamSlots(props.params, props.slotCount);
});

function paramToken(slot: number): string {
  return `{{p${slot}}}`;
}

function onSourceChange(param: TableSqlParamBinding | undefined) {
  if (!param) return;
  if (param.source === "literal" || param.source === "batch_no") {
    param.opcuaNodeId = "";
  }
}
</script>

<style scoped>
.sspb {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--border-subtle, #e4e4e7);
  border-radius: 8px;
  background: var(--surface-muted, #fafafa);
}
.sspb-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-secondary, #52525b);
}
.sspb-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.sspb-row:last-child {
  margin-bottom: 0;
}
.sspb-token {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  min-width: 2.5rem;
}
.sspb-source {
  min-width: 7.5rem;
}
.sspb-value,
.sspb-node {
  flex: 1 1 120px;
  min-width: 100px;
}
.sspb-fallback {
  flex: 1 1 80px;
  min-width: 72px;
}
.sspb-pick {
  flex-shrink: 0;
}
.sspb-batch-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted, #71717a);
}
/* 属性面板同款输入/按钮样式（父级 scoped 样式无法作用到本组件内部） */
.lpep-inp {
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
}
.lpep-file-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
}
.lpep-file-btn:hover {
  background: #e0e7ff;
}
</style>
