<template>
  <div class="pbf">
    <label class="lpep-lab">
      绑定方式
      <select v-model="el.bindingKind" class="lpep-inp">
        <option value="none">无</option>
        <option value="opcua">OPC UA</option>
        <option value="sql">SQL</option>
      </select>
    </label>

    <div v-if="el.bindingKind === 'none'" class="lpep-opc-quick">
      <button type="button" class="lpep-file-btn" @click="emit('opc-pick-parameter')">
        从 OPC UA 地址空间选择节点…
      </button>
      <p class="lpep-hint-muted">
        与表格单元格相同：展开连接后点选节点并确定绑定；亦可先把绑定改为「OPC UA」再选手工填写。
      </p>
    </div>

    <div v-if="el.bindingKind === 'opcua'" class="lpep-opc-row">
      <label class="lpep-lab lpep-opc-row-grow">
        OPC UA 节点 ID
        <input v-model.trim="el.opcuaNodeId" class="lpep-inp" placeholder="节点 NodeId" />
      </label>
      <button type="button" class="lpep-file-btn lpep-opc-pickbtn" @click="emit('opc-pick-parameter')">
        从列表选择…
      </button>
    </div>

    <template v-if="el.bindingKind === 'sql'">
      <ScalarSqlQueryBuilder
        :sql-text="el.sqlText"
        :fill-mode="scalarFillMode"
        :visual="scalarVisual"
        @update:sql-text="el.sqlText = $event"
        @update:fill-mode="scalarFillMode = $event"
        @update:visual="scalarVisual = $event"
      />
      <ScalarSqlParamBindingsEditor :params="sqlParams" @opc-pick="(slot) => emit('opc-pick-sql-param', slot)" />
    </template>

    <label class="lpep-lab">
      展示占位文字
      <textarea v-model.trim="el.text" rows="2" class="lpep-inp" placeholder="预览用" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ScalarSqlParamBindingsEditor from "@/components/report-template/ScalarSqlParamBindingsEditor.vue";
import ScalarSqlQueryBuilder from "@/components/report-template/ScalarSqlQueryBuilder.vue";
import {
  defaultScalarSqlVisual,
  hydrateScalarSqlVisual,
  normalizeScalarSqlFillMode,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "@/lib/report-template/scalar-sql-visual";
import {
  ensureSqlParamSlots,
  type TableSqlParamBinding,
} from "@/lib/report-template/table-sql-fill";

/** 模版 / 版式共用的数据参数绑定字段 */
export type ParameterBindingElement = {
  bindingKind: "none" | "opcua" | "sql";
  opcuaNodeId: string;
  sqlText: string;
  sqlParams: TableSqlParamBinding[];
  text: string;
  scalarSqlFillMode?: ScalarSqlFillMode;
  scalarSqlVisual?: ScalarSqlVisualConfig | null;
};

const props = defineProps<{
  el: ParameterBindingElement;
}>();

const emit = defineEmits<{
  "opc-pick-parameter": [];
  "opc-pick-sql-param": [slot: number];
}>();

const sqlParams = computed(() => {
  if (!Array.isArray(props.el.sqlParams)) props.el.sqlParams = [];
  ensureSqlParamSlots(props.el.sqlParams, 2);
  return props.el.sqlParams;
});

const scalarFillMode = computed<ScalarSqlFillMode>({
  get() {
    return normalizeScalarSqlFillMode(props.el.scalarSqlFillMode, props.el.sqlText);
  },
  set(v) {
    props.el.scalarSqlFillMode = v;
  },
});

const scalarVisual = computed<ScalarSqlVisualConfig>({
  get() {
    if (!props.el.scalarSqlVisual) {
      props.el.scalarSqlVisual = defaultScalarSqlVisual();
    }
    return hydrateScalarSqlVisual(props.el.scalarSqlVisual);
  },
  set(v) {
    props.el.scalarSqlVisual = v;
  },
});
</script>
