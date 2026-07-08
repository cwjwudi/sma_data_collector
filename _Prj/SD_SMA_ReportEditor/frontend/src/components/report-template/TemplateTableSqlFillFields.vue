<template>
  <div class="tbl-sql-fill">
    <label class="tbl-sql-fill-mode">
      <span class="tbl-sql-fill-mode-t">来源</span>
      <select v-model="fill.fillMode" :class="selectFieldClass">
        <option value="visual">数据连接（可视化）</option>
        <option value="manual_sql">手写 SQL</option>
      </select>
    </label>

    <TemplateTableSqlVisualPanel
      v-if="fill.fillMode === 'visual'"
      :fill="fill"
      :column-count="columnCount"
      :textarea-class="textareaClass"
      :select-class="selectFieldClass"
      :button-class="pickBtnClass"
      @opc-pick-param="$emit('opcPickParam', $event)"
    />

    <template v-if="fill.fillMode === 'manual_sql'">
      <label class="tbl-sql-fill-lab"
        >SELECT
        <textarea
          v-model="fill.querySql"
          :class="textareaClass"
          rows="5"
          spellcheck="false"
          :placeholder="sqlPlaceholder"
      /></label>
      <div class="tbl-sql-fill-params">
        <div class="tbl-sql-fill-param">
          <span v-pre class="tbl-sql-fill-param-title">{{p0}}</span>
          <label class="tbl-sql-fill-source">
            <span class="tbl-sql-fill-source-t">取值方式</span>
            <select v-model="fill.params[0].source" :class="selectFieldClass" @change="onManualParamSourceChange(fill.params[0])">
              <option value="literal">手写固定值</option>
              <option value="opcua">OPC UA</option>
              <option value="batch_no">结批批次号</option>
            </select>
          </label>
          <template v-if="fill.params[0].source === 'literal'">
            <label class="tbl-sql-fill-inline tbl-sql-lit-only">
              固定值
              <input v-model.trim="fill.params[0].literalFallback" class="tbl-sql-text-inp" placeholder="用于替换 p0 的字面量" />
            </label>
          </template>
          <template v-else-if="fill.params[0].source === 'opcua'">
            <input v-model.trim="fill.params[0].opcuaNodeId" class="tbl-sql-text-inp tbl-sql-node-inp" placeholder="NodeId" spellcheck="false" />
            <button type="button" :class="pickBtnClass" @click="emitPick(0)">选择节点</button>
            <label class="tbl-sql-fill-inline tbl-sql-fallback">
              默认（无值时）
              <input v-model.trim="fill.params[0].literalFallback" class="tbl-sql-text-inp" placeholder="可选" />
            </label>
          </template>
          <template v-else-if="fill.params[0].source === 'batch_no'">
            <label class="tbl-sql-fill-inline tbl-sql-fallback">
              默认（无值时）
              <input v-model.trim="fill.params[0].literalFallback" class="tbl-sql-text-inp" placeholder="可选" />
            </label>
          </template>
        </div>
        <div class="tbl-sql-fill-param">
          <span v-pre class="tbl-sql-fill-param-title">{{p1}}</span>
          <label class="tbl-sql-fill-source">
            <span class="tbl-sql-fill-source-t">取值方式</span>
            <select v-model="fill.params[1].source" :class="selectFieldClass" @change="onManualParamSourceChange(fill.params[1])">
              <option value="literal">手写固定值</option>
              <option value="opcua">OPC UA</option>
              <option value="batch_no">结批批次号</option>
            </select>
          </label>
          <template v-if="fill.params[1].source === 'literal'">
            <label class="tbl-sql-fill-inline tbl-sql-lit-only">
              固定值
              <input v-model.trim="fill.params[1].literalFallback" class="tbl-sql-text-inp" placeholder="用于替换 p1 的字面量" />
            </label>
          </template>
          <template v-else-if="fill.params[1].source === 'opcua'">
            <input v-model.trim="fill.params[1].opcuaNodeId" class="tbl-sql-text-inp tbl-sql-node-inp" placeholder="NodeId" spellcheck="false" />
            <button type="button" :class="pickBtnClass" @click="emitPick(1)">选择节点</button>
            <label class="tbl-sql-fill-inline tbl-sql-fallback">
              默认（无值时）
              <input v-model.trim="fill.params[1].literalFallback" class="tbl-sql-text-inp" placeholder="可选" />
            </label>
          </template>
          <template v-else-if="fill.params[1].source === 'batch_no'">
            <label class="tbl-sql-fill-inline tbl-sql-fallback">
              默认（无值时）
              <input v-model.trim="fill.params[1].literalFallback" class="tbl-sql-text-inp" placeholder="可选" />
            </label>
          </template>
        </div>
      </div>
    </template>

    <label class="tbl-sql-fill-lab tbl-sql-fill-maxrows">
      最大行数
      <input
        v-model.number="maxRowsProxy"
        type="number"
        min="1"
        max="50000"
        step="1"
        class="tbl-sql-text-inp tbl-sql-maxrows-num"
      />
    </label>
    <label v-if="allowSplitReports" class="tbl-sql-fill-minichk">
      <input v-model="fill.splitReportsOnMaxRows" type="checkbox" />
      <span>超出最大数量自动分报表</span>
    </label>
    <p v-if="allowSplitReports && fill.splitReportsOnMaxRows" class="tbl-sql-fill-policy-hint">
      开启后，如果查询结果超过最大行数，会按最大行数拆成多份报表；同时模板中只允许保留一个数据库填充表。
    </p>
    <label class="tbl-sql-fill-minichk">
      <input v-model="fill.repeatHeaderOnPageBreak" type="checkbox" />
      <span>跨页重复表头</span>
    </label>
    <label class="tbl-sql-fill-minichk">
      <input v-model="fill.allowWidgetsBelowSqlFillTable" type="checkbox" />
      <span>允许在表格下方摆放控件</span>
    </label>
    <p v-if="fill.allowWidgetsBelowSqlFillTable" class="tbl-sql-fill-policy-hint">
      开启后编辑画布不再阻止表下拖拽；导出预览仍会将「表下控件」排到表格分页之后的单独页面。若要与表格同页排版其它控件，请新建正文页后再放置。
    </p>
  </div>
</template>

<script setup lang="ts">
import TemplateTableSqlVisualPanel from "@/components/report-template/TemplateTableSqlVisualPanel.vue";
import {
  clampTableSqlMaxRows,
  ensureMinTableSqlParamSlots,
  ensureVisualSource,
  type TableSqlFillConfig,
  type TableSqlParamBinding,
} from "@/lib/report-template/table-sql-fill";
import { syncVisualFillQueryAndResultNames } from "@/lib/report-template/table-sql-visual-compile";
import { computed, watch } from "vue";

const props = withDefaults(
  defineProps<{
    fill: TableSqlFillConfig;
    columnCount: number;
    textareaClass?: string;
    /** 下拉框专用 class（勿与多行 textarea 共用同一套样式） */
    selectClass?: string;
    buttonClass?: string;
    allowSplitReports?: boolean;
  }>(),
  {
    textareaClass: "lpep-inp",
    selectClass: "",
    buttonClass: "",
    allowSplitReports: false,
  },
);

const emit = defineEmits<{
  opcPickParam: [slot: number];
  syncHeaders: [];
}>();

const pickBtnClass = computed(() => props.buttonClass || "tbl-sql-side-btn");

const selectFieldClass = computed(() => {
  const c = (props.selectClass || "").trim();
  return c || "tbl-sql-ddl";
});

const allowSplitReports = computed(() => props.allowSplitReports === true);

const sqlPlaceholder = "SELECT a,b FROM t WHERE x BETWEEN {{p0}} AND {{p1}}";

function emitPick(slot: number) {
  emit("opcPickParam", slot);
}

function onManualParamSourceChange(b: TableSqlParamBinding) {
  if (b.source !== "opcua") b.opcuaNodeId = "";
}

const maxRowsProxy = computed({
  get(): number {
    return props.fill.maxRows;
  },
  set(v: number) {
    props.fill.maxRows = clampTableSqlMaxRows(v);
  },
});

watch(
  () => [props.fill.enabled, props.fill.fillMode] as const,
  ([en, mode]) => {
    if (en && mode === "visual") ensureVisualSource(props.fill);
    if (en && mode === "manual_sql") ensureMinTableSqlParamSlots(props.fill, 2);
  },
  { immediate: true },
);

watch(
  () => allowSplitReports.value,
  (allow) => {
    if (!allow) props.fill.splitReportsOnMaxRows = false;
  },
  { immediate: true },
);

watch(
  () => ({
    en: props.fill.enabled,
    mode: props.fill.fillMode,
    vs: props.fill.visualSource,
    vf: props.fill.visualFilters,
    cols: props.columnCount,
  }),
  () => {
    const f = props.fill;
    if (!f.enabled || f.fillMode !== "visual") return;
    ensureVisualSource(f);
    syncVisualFillQueryAndResultNames(f, props.columnCount);
  },
  { deep: true, immediate: true },
);
</script>

<style scoped>
.tbl-sql-fill {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tbl-sql-fill-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #52525b;
}
.tbl-sql-fill-mode-t {
  font-weight: 600;
  color: #3f3f46;
}
.tbl-sql-fill-lab {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #52525b;
}
.tbl-sql-fill-params {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tbl-sql-fill-param {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.tbl-sql-fill-source {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 9rem;
}
.tbl-sql-fill-source-t {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.tbl-sql-text-inp {
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.35;
  color: #18181b;
  background: #fff;
  min-height: 34px;
}
input.tbl-sql-text-inp {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
.tbl-sql-text-inp:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 1px rgb(99 102 241 / 0.25);
}
.tbl-sql-node-inp {
  flex: 1;
  min-width: 140px;
}
.tbl-sql-lit-only input {
  width: min(100%, 280px);
}
.tbl-sql-fill-param-title {
  font-weight: 600;
  color: #4338ca;
  min-width: 3rem;
}
.tbl-sql-side-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  align-self: flex-start;
}
.tbl-sql-side-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tbl-sql-fill-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.tbl-sql-fallback .tbl-sql-text-inp {
  width: min(100%, 200px);
}
.tbl-sql-fill-maxrows .tbl-sql-maxrows-num {
  max-width: 120px;
  width: 100%;
}
.tbl-sql-fill-minichk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #52525b;
}
.tbl-sql-fill-policy-hint {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.45;
  color: #57534e;
  background: rgb(254 252 232 / 0.95);
  border: 1px solid rgb(253 230 138 / 0.85);
  border-radius: 8px;
}
/** 与正文属性侧栏 input 协调，但保留原生下拉箭头与单行高度 */
.tbl-sql-ddl {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: #18181b;
  background: #fff;
  min-height: 34px;
  appearance: auto;
  cursor: pointer;
}
.tbl-sql-ddl:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 1px rgb(99 102 241 / 0.25);
}
</style>
