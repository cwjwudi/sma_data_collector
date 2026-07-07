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
    // 不在 getter 中回写 props.el：仅点选控件不应把模版标记为已修改
    return hydrateScalarSqlVisual(props.el.scalarSqlVisual);
  },
  set(v) {
    props.el.scalarSqlVisual = v;
  },
});
</script>

<style scoped>
/* 父组件（TemplateElementProps / LayoutPresetElementProps）的 scoped 样式
   不会作用到子组件内部，此处按属性面板同款样式本地定义。 */
.pbf {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.pbf .lpep-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pbf .lpep-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
}
.pbf .lpep-file-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  align-self: flex-start;
}
.pbf .lpep-file-btn:hover {
  background: #e0e7ff;
}
.pbf .lpep-hint-muted {
  margin: 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.45;
}
.pbf .lpep-opc-quick {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pbf .lpep-opc-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}
.pbf .lpep-opc-row-grow {
  flex: 1;
  min-width: 160px;
}
.pbf .lpep-opc-pickbtn {
  flex-shrink: 0;
  align-self: flex-end;
}
</style>
