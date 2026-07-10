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

    <div v-if="el.bindingKind === 'opcua' || el.bindingKind === 'sql'" class="pbf-null-mode">
      <span class="lpep-lab lpep-lab--block">空值显示</span>
      <div class="pbf-null-seg" role="group" aria-label="绑定为空时的显示方式">
        <button
          type="button"
          class="pbf-null-seg-btn"
          :class="{ 'pbf-null-seg-btn--on': nullMode === 'blank' }"
          @click="nullMode = 'blank'"
        >
          空白
        </button>
        <button
          type="button"
          class="pbf-null-seg-btn"
          :class="{ 'pbf-null-seg-btn--on': nullMode === 'emptyLabel' }"
          @click="nullMode = 'emptyLabel'"
        >
          显示「空值」
        </button>
        <button
          type="button"
          class="pbf-null-seg-btn"
          :class="{ 'pbf-null-seg-btn--on': nullMode === 'fallbackText' }"
          @click="nullMode = 'fallbackText'"
        >
          默认文字
        </button>
      </div>
      <p class="lpep-hint-muted">
        数据库或 OPC 读数为 null / 空串 / 无行时生效；有真实值时仍显示读数。
      </p>
      <label v-if="nullMode === 'fallbackText'" class="lpep-lab">
        空值时默认文字
        <textarea
          v-model.trim="el.text"
          rows="2"
          class="lpep-inp"
          placeholder="例如：待填写、N/A"
          spellcheck="false"
        />
      </label>
      <label class="lpep-lab">
        小数位数（REAL）
        <input
          :value="decimalPlacesInput"
          type="number"
          min="0"
          max="10"
          step="1"
          class="lpep-inp"
          placeholder="留空=不强制"
          @change="onDecimalPlacesChange"
        />
      </label>
      <p class="lpep-hint-muted">仅对可解析为数字的读数生效（如 OPC REAL / 数据库浮点）；留空则按原样显示。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ScalarSqlParamBindingsEditor from "@/components/report-template/ScalarSqlParamBindingsEditor.vue";
import ScalarSqlQueryBuilder from "@/components/report-template/ScalarSqlQueryBuilder.vue";
import type { NullDisplayMode } from "@/lib/report-template/layout-zone-element";
import { normalizeNullDisplayMode } from "@/lib/report-template/layout-zone-element";
import { DECIMAL_PLACES_MAX, normalizeDecimalPlaces } from "@/lib/report-template/numeric-display";
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
  nullDisplayMode?: NullDisplayMode;
  decimalPlaces?: number;
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

const nullMode = computed({
  get: () => normalizeNullDisplayMode(props.el.nullDisplayMode),
  set: (v: NullDisplayMode) => {
    props.el.nullDisplayMode = v;
  },
});

const decimalPlacesInput = computed(() => {
  const n = normalizeDecimalPlaces(props.el.decimalPlaces);
  return n === undefined ? "" : String(n);
});

function onDecimalPlacesChange(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  if (raw.trim() === "") {
    props.el.decimalPlaces = undefined;
    return;
  }
  props.el.decimalPlaces = normalizeDecimalPlaces(raw) ?? 0;
  if ((props.el.decimalPlaces ?? 0) > DECIMAL_PLACES_MAX) {
    props.el.decimalPlaces = DECIMAL_PLACES_MAX;
  }
}

const scalarFillMode = computed({
  get: () => normalizeScalarSqlFillMode(props.el.scalarSqlFillMode, props.el.sqlText),
  set: (v: ScalarSqlFillMode) => {
    props.el.scalarSqlFillMode = v;
  },
});

const scalarVisual = computed({
  get: () => hydrateScalarSqlVisual(props.el.scalarSqlVisual),
  set: (v: ScalarSqlVisualConfig) => {
    props.el.scalarSqlVisual = v;
  },
});

const sqlParams = computed({
  get: () => {
    if (!Array.isArray(props.el.sqlParams)) props.el.sqlParams = [];
    ensureSqlParamSlots(props.el.sqlParams, 2);
    return props.el.sqlParams;
  },
  set: (v: TableSqlParamBinding[]) => {
    props.el.sqlParams = v;
  },
});
</script>

<style scoped>
/* 父组件 scoped 样式不会穿透到本子组件，此处按属性面板同款本地定义 */
.pbf {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.pbf-null-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed #e4e4e7;
}
.lpep-lab--block {
  display: block;
  margin-bottom: 2px;
}
.pbf-null-seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
}
.pbf-null-seg-btn {
  margin: 0;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  color: #52525b;
}
.pbf-null-seg-btn--on {
  background: #fff;
  color: #18181b;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
</style>
