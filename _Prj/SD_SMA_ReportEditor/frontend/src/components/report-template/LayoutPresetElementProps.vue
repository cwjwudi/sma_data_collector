<template>
  <div v-if="el" class="lpep">
    <h5 class="lpep-h">属性</h5>
    <p class="lpep-type-tag">{{ zoneTypeLabel }}</p>
    <div class="lpep-grid">
      <label
        v-if="el.type === 'text' || el.type === 'box'"
        class="lpep-lab"
        >文字<input v-model.trim="el.text" class="lpep-inp"
      /></label>
      <div v-if="el.type === 'text' || el.type === 'box'" class="lpep-lab lpep-wrap-row">
        <span class="lpep-wrap-title">换行</span>
        <div class="lpep-seg" role="group" aria-label="文本换行方式">
          <button
            type="button"
            class="lpep-seg-btn"
            :class="{ 'lpep-seg-on': !el.textAutoWrap }"
            :aria-pressed="!el.textAutoWrap"
            @click="el.textAutoWrap = false"
          >
            单行
          </button>
          <button
            type="button"
            class="lpep-seg-btn"
            :class="{ 'lpep-seg-on': el.textAutoWrap }"
            :aria-pressed="el.textAutoWrap"
            @click="el.textAutoWrap = true"
          >
            自动
          </button>
        </div>
        <p class="lpep-wrap-hint">「自动」表示在框宽内换行，无空格长串也会断行。</p>
      </div>
      <BoxZoneColorPicker v-if="el.type !== 'table'" :el="el" />
      <template v-if="el.type === 'date'">
        <label class="lpep-lab"
          >日期格式
          <select
            class="lpep-inp"
            :value="dateFormatSelectValue"
            @change="onDateFormatPresetChange($event)"
          >
            <option v-for="p in DATE_FORMAT_PRESETS" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
            <option value="__custom__">自定义…</option>
          </select>
        </label>
        <label v-if="dateFormatIsCustom" class="lpep-lab"
          >自定义 pattern<input
            v-model.trim="el.dateFormat"
            class="lpep-inp"
            spellcheck="false"
            placeholder="如 yyyy-MM-dd、yyyy年MM月dd日、含 HH:mm"
        /></label>
        <div class="lpep-lab lpep-wrap-row">
          <span class="lpep-wrap-title">换行</span>
          <div class="lpep-seg" role="group" aria-label="日期文本换行方式">
            <button
              type="button"
              class="lpep-seg-btn"
              :class="{ 'lpep-seg-on': !el.textAutoWrap }"
              :aria-pressed="!el.textAutoWrap"
              @click="el.textAutoWrap = false"
            >
              单行
            </button>
            <button
              type="button"
              class="lpep-seg-btn"
              :class="{ 'lpep-seg-on': el.textAutoWrap }"
              :aria-pressed="el.textAutoWrap"
              @click="el.textAutoWrap = true"
            >
              自动
            </button>
          </div>
          <p class="lpep-wrap-hint">「自动」表示在框宽内换行，无空格长串也会断行。</p>
        </div>
      </template>
      <template v-if="el.type === 'image'">
        <label class="lpep-lab"
          >配文<textarea v-model="el.text" rows="2" class="lpep-inp" spellcheck="false" placeholder="与图片同框显示的文字"
        ></textarea></label>
        <label class="lpep-lab"
          >配文位置<select v-model="el.imageCaptionPosition" class="lpep-inp">
            <option value="none">无配文</option>
            <option value="top">图上方</option>
            <option value="bottom">图下方</option>
            <option value="left">图左侧</option>
            <option value="right">图右侧</option>
          </select></label
        >
        <label class="lpep-lab"
          >图片水平位置（九宫格）<select v-model="el.alignX" class="lpep-inp">
            <option value="start">左</option>
            <option value="center">中</option>
            <option value="end">右</option>
          </select></label
        >
        <label class="lpep-lab"
          >图片垂直位置（九宫格）<select v-model="el.alignY" class="lpep-inp">
            <option value="start">上</option>
            <option value="center">中</option>
            <option value="end">下</option>
          </select></label
        >
        <label class="lpep-lab"
          >旋转角（°）<input
            v-model.number="el.imageRotationDeg"
            type="number"
            min="-360"
            max="360"
            step="1"
            class="lpep-inp"
        /></label>
        <label class="lpep-lab"
          >图片来源 URL / data<input v-model.trim="el.imageSrc" class="lpep-inp"
        /></label>
        <input
          ref="imgFileEl"
          type="file"
          accept="image/*,.svg"
          class="lpep-sr-file"
          aria-hidden="true"
          tabindex="-1"
          @change="onLocalImageChosen"
        />
        <button type="button" class="lpep-file-btn" @click="pickLocalImage">从本机选取图片…</button>
        <span class="lpep-img-hint">图片将转为 data URL，与预设 JSON 一并保存。水平×垂直对齐控制图片在占位格内的九宫格。</span>
      </template>
      <template v-if="el.type === 'parameter'">
        <ParameterBindingFields
          :el="el"
          @opc-pick-parameter="openOpcPicker('parameter')"
          @opc-pick-sql-param="openZoneScalarSqlParamOpcPicker"
        />
      </template>
      <template v-if="el.type === 'table'">
        <div class="lpep-table-dims">
          <div class="lpep-dim-field">
            <span class="lpep-dim-title">行数</span>
            <div
              class="lpep-dim-stepper"
              role="group"
              aria-label="表格行数"
              :title="zoneSqlFillEnabled ? '数据库填充开启时行数随预览查询结果自动同步（1 行表头 + 数据行）。' : ''"
            >
              <button
                type="button"
                class="lpep-dim-btn"
                title="减少一行"
                aria-label="减少一行"
                :disabled="zoneSqlFillEnabled || tableDimRows <= 1"
                @click="bumpTableDimRows(-1)"
              >
                −
              </button>
              <input
                v-model.number="tableDimRows"
                type="number"
                min="1"
                max="30"
                class="lpep-dim-val"
                :disabled="zoneSqlFillEnabled"
                :readonly="zoneSqlFillEnabled"
              />
              <button
                type="button"
                class="lpep-dim-btn"
                title="增加一行"
                aria-label="增加一行"
                :disabled="zoneSqlFillEnabled || tableDimRows >= 30"
                @click="bumpTableDimRows(1)"
              >
                +
              </button>
            </div>
          </div>
          <div class="lpep-dim-field">
            <span class="lpep-dim-title">列数</span>
            <div class="lpep-dim-stepper" role="group" aria-label="表格列数">
              <button
                type="button"
                class="lpep-dim-btn"
                title="减少一列"
                aria-label="减少一列"
                :disabled="tableDimCols <= 1"
                @click="bumpTableDimCols(-1)"
              >
                −
              </button>
              <input
                v-model.number="tableDimCols"
                type="number"
                min="1"
                max="30"
                class="lpep-dim-val"
              />
              <button
                type="button"
                class="lpep-dim-btn"
                title="增加一列"
                aria-label="增加一列"
                :disabled="tableDimCols >= 30"
                @click="bumpTableDimCols(1)"
              >
                +
              </button>
            </div>
          </div>
          <div class="lpep-dim-field">
            <span class="lpep-dim-title">行高（px）</span>
            <div class="lpep-dim-stepper" role="group" aria-label="表格行高">
              <button
                type="button"
                class="lpep-dim-btn"
                title="减小行高"
                aria-label="减小行高"
                :disabled="zoneTableRowHeightModel <= TABLE_ROW_HEIGHT_MIN_PX"
                @click="bumpZoneTableRowHeight(-1)"
              >
                −
              </button>
              <input
                v-model.number="zoneTableRowHeightModel"
                type="number"
                :min="TABLE_ROW_HEIGHT_MIN_PX"
                :max="TABLE_ROW_HEIGHT_MAX_PX"
                step="1"
                class="lpep-dim-val"
              />
              <button
                type="button"
                class="lpep-dim-btn"
                title="增大行高"
                aria-label="增大行高"
                :disabled="zoneTableRowHeightModel >= TABLE_ROW_HEIGHT_MAX_PX"
                @click="bumpZoneTableRowHeight(1)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div class="lpep-table-col-widths">
          <span class="lpep-dim-title">列宽</span>
          <TableColumnWidthVisualEditor
            v-if="zonePresetTableCellMetric"
            :column-widths-px="zoneTableColumnInnerWidths"
            :inner-w="zonePresetTableCellMetric.innerW"
            @resize-delta="onZoneTableColumnResizeFromProps"
          />
        </div>
        <p class="lpep-hint-muted">
          {{
            zoneSqlFillEnabled
              ? "列数、行高变更后立即应用到画布。数据库填充开启时行数随预览查询结果自动同步；单元格静态文字不在此编辑；可视化模式下请在画布第一行选择输出列。"
              : "行列、行高变更后立即应用到画布。单击单元格可设置填充色、编辑静态文字或 OPC UA / SQL。"
          }}
        </p>
        <p v-if="!hasTableCellPicked" class="lpep-hint-muted">
          在画布上单击单元格后，可在此设置该单元格的填充色。
        </p>
        <p v-if="zonePresetTableCellMetric" class="lpep-table-metric">
          单元格高度（推算）：高约 <strong>{{ formatMetricPx(zonePresetTableCellMetric.cellH) }}</strong> px
        </p>
        <template v-if="hasTableCellPicked && activeTableCell">
          <div class="lpep-table-cell-fields" :key="'lz-' + editCellRow + '-' + editCellCol">
            <div class="lpep-table-cell-fill-block">
              <TableCellFillPicker v-model="activeTableCellFill" title="填充色" />
            </div>
            <template v-if="!zoneSqlFillEnabled">
              <label class="lpep-lab"
                >静态文字<textarea v-model.trim="activeTableCell.text" rows="2" class="lpep-inp" spellcheck="false"
              /></label>
              <label class="lpep-lab"
                >单元格绑定<select v-model="activeTableCell.bindingKind" class="lpep-inp">
                  <option value="none">无（仅静态文字）</option>
                  <option value="opcua">OPC UA</option>
                  <option value="sql">SQL（数据库）</option>
                </select></label
              >
              <div v-if="activeTableCell.bindingKind === 'none'" class="lpep-opc-quick">
                <button type="button" class="lpep-file-btn" @click="openOpcPicker('table')">
                  从 OPC UA 地址空间选择节点…
                </button>
              </div>
              <div v-if="activeTableCell.bindingKind === 'opcua'" class="lpep-opc-row">
                <label class="lpep-lab lpep-opc-row-grow"
                  >OPC UA 节点 ID<input
                    v-model.trim="activeTableCell.opcuaNodeId"
                    class="lpep-inp"
                    placeholder="NodeId"
                /></label>
                <button type="button" class="lpep-file-btn lpep-opc-pickbtn" @click="openOpcPicker('table')">
                  从列表选择…
                </button>
              </div>
              <template v-if="activeTableCell.bindingKind === 'sql'">
                <ScalarSqlQueryBuilder
                  :sql-text="activeTableCell.sqlText"
                  :fill-mode="zoneTableCellScalarFillMode"
                  :visual="zoneTableCellScalarVisual"
                  @update:sql-text="activeTableCell.sqlText = $event"
                  @update:fill-mode="zoneTableCellScalarFillMode = $event"
                  @update:visual="zoneTableCellScalarVisual = $event"
                />
                <ScalarSqlParamBindingsEditor
                  :params="zoneTableCellSqlParams"
                  @opc-pick="openZoneTableCellSqlParamOpcPicker"
                />
              </template>
            </template>
            <p v-else class="lpep-hint-muted">
              数据库填充已开启：表格内容由查询填充，请勿在此编辑静态文字。可视化数据源时请在画布<strong>第一行</strong>下拉选择各列对应字段。
            </p>
          </div>
        </template>
        <div v-if="el && el.type === 'table'" class="lpep-table-sql-fill-block">
          <div class="lpep-sql-fill-row">
            <span class="lpep-sql-fill-title">数据库填充</span>
            <button
              type="button"
              class="lpep-switch"
              :class="{ 'lpep-switch--on': zoneSqlFillEnabled }"
              role="switch"
              :aria-checked="zoneSqlFillEnabled"
              :disabled="zoneSqlFillSwitchLocked"
              @click="onZoneSqlFillToggle"
            />
          </div>
          <p v-if="zoneSqlFillSwitchLocked" class="lpep-hint-muted">
            存在单元格 OPC UA / SQL 绑定时无法开启；请先清空绑定。
          </p>
          <TemplateTableSqlFillFields
            v-if="zoneSqlFillEnabled"
            :fill="ensureZoneTableSqlFill(el)"
            :column-count="el.tableCols ?? 4"
            button-class="lpep-file-btn"
            @opc-pick-param="openZoneSqlOpcPicker"
            @sync-headers="onZoneSqlFillSyncHeaders"
          />
        </div>
      </template>
      <template v-if="el.type !== 'image'">
        <label class="lpep-lab"
          >水平位置<select v-model="el.alignX" class="lpep-inp">
            <option value="start">左</option>
            <option value="center">中</option>
            <option value="end">右</option>
          </select></label
        >
        <label class="lpep-lab"
          >垂直位置<select v-model="el.alignY" class="lpep-inp">
            <option value="start">上</option>
            <option value="center">中</option>
            <option value="end">下</option>
          </select></label
        >
      </template>
      <template v-if="el.type === 'pageNumber'">
        <label class="lpep-lab">形式</label>
        <select v-model="el.pageNumberMode" class="lpep-inp">
          <option value="plain">仅数字</option>
          <option value="slashTotal">当前页/总页数</option>
          <option value="cnPage">第N页</option>
          <option value="circle">圆形框</option>
        </select>
      </template>
      <label class="lpep-lab"
        >叠放顺序（越大越靠前）<input
          v-model.number="el.zIndex"
          type="number"
          min="0"
          max="10000"
          step="1"
          class="lpep-inp"
      /></label>
      <LayoutFontFamilyField v-model="el.fontFamily" />
      <label class="lpep-lab">字号<input v-model.number="el.fontSize" type="number" min="8" max="72" class="lpep-inp" /></label>
      <label class="lpep-lab"
        >X<input
          v-model="geomX"
          type="text"
          inputmode="decimal"
          class="lpep-inp"
          @change="commitGeomX"
          @keydown.enter.prevent="commitGeomX"
      /></label>
      <label class="lpep-lab"
        >Y<input
          v-model="geomY"
          type="text"
          inputmode="decimal"
          class="lpep-inp"
          @change="commitGeomY"
          @keydown.enter.prevent="commitGeomY"
      /></label>
      <label class="lpep-lab"
        >W<input
          v-model="geomW"
          type="text"
          inputmode="decimal"
          class="lpep-inp"
          @change="commitGeomW"
          @keydown.enter.prevent="commitGeomW"
      /></label>
      <label class="lpep-lab"
        >H<input
          v-model="geomH"
          type="text"
          inputmode="decimal"
          class="lpep-inp"
          @change="commitGeomH"
          @keydown.enter.prevent="commitGeomH"
      /></label>
      <button type="button" class="lpep-del" @click="$emit('remove')">删除选中</button>
    </div>
    <OpcUaNodePickerModal v-model="opcPickOpen" @confirm="onOpcPickConfirm" />
  </div>
  <div v-else class="lpep-grey">
    <p>在画布上点选控件后在编辑属性。</p>
  </div>
</template>

<script setup lang="ts">
import OpcUaNodePickerModal from "@/features/datasource/opcua/OpcUaNodePickerModal.vue";
import TemplateTableSqlFillFields from "@/components/report-template/TemplateTableSqlFillFields.vue";
import {
  DATE_FORMAT_PRESETS,
  clampZoneTableOuterSize,
  ensureZoneTableGrid,
  zoneTableColumnInnerWidthsPx,
  type LayoutControlType,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import BoxZoneColorPicker from "@/components/report-template/BoxZoneColorPicker.vue";
import LayoutFontFamilyField from "@/components/report-template/LayoutFontFamilyField.vue";
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import {
  layoutPresetTableCellPickKey,
} from "@/lib/report-template/template-editor-context";
import {
  applyTableColumnResizeDeltaPx,
  REPORT_ZONE_TABLE_NODE_PADDING_PX,
  clampTableRowHeightPx,
  formatMetricPx,
  uniformTableCellBoxPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
  TABLE_ROW_HEIGHT_MAX_PX,
  TABLE_ROW_HEIGHT_MIN_PX,
} from "@/lib/report-template/table-cell-metrics";
import TableColumnWidthVisualEditor from "@/components/report-template/TableColumnWidthVisualEditor.vue";
import TableCellFillPicker from "@/components/report-template/TableCellFillPicker.vue";
import ParameterBindingFields from "@/components/report-template/ParameterBindingFields.vue";
import ScalarSqlParamBindingsEditor from "@/components/report-template/ScalarSqlParamBindingsEditor.vue";
import ScalarSqlQueryBuilder from "@/components/report-template/ScalarSqlQueryBuilder.vue";
import {
  hydrateScalarSqlVisual,
  normalizeScalarSqlFillMode,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "@/lib/report-template/scalar-sql-visual";
import type { TableSqlFillConfig, TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import {
  defaultTableSqlFillConfig,
  ensureSqlParamSlots,
  ensureTableSqlResultColumnNames,
  syncResultColumnNamesFromFirstRow,
} from "@/lib/report-template/table-sql-fill";
import { applyTableSqlFillOpcPick } from "@/lib/report-template/table-sql-visual-compile";
import { useDeferredGeomField } from "@/lib/report-template/deferred-geom-input";
import { clearGridCellBindings, gridHasNonNoneBinding } from "@/lib/report-template/table-binding-utils";
import { computed, inject, nextTick, ref, watch } from "vue";

const props = defineProps<{
  el: LayoutZoneElement | null;
}>();

function commitZoneGeomAndClamp() {
  const el = props.el;
  if (el?.type === "table") clampZoneTableOuterSize(el);
}

const geomXField = useDeferredGeomField(() => props.el, "x", commitZoneGeomAndClamp);
const geomYField = useDeferredGeomField(() => props.el, "y", commitZoneGeomAndClamp);
const geomWField = useDeferredGeomField(() => props.el, "w", commitZoneGeomAndClamp);
const geomHField = useDeferredGeomField(() => props.el, "h", commitZoneGeomAndClamp);
const geomX = geomXField.model;
const geomY = geomYField.model;
const geomW = geomWField.model;
const geomH = geomHField.model;
const commitGeomX = geomXField.commit;
const commitGeomY = geomYField.commit;
const commitGeomW = geomWField.commit;
const commitGeomH = geomHField.commit;

const layoutTablePick = inject(layoutPresetTableCellPickKey, undefined);

const ZONE_TYPE_LABELS: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
  table: "表格",
  parameter: "数据参数",
};

const zoneTypeLabel = computed(() => {
  const el = props.el;
  if (!el) return "";
  return ZONE_TYPE_LABELS[el.type] ?? el.type;
});

const opcPickOpen = ref(false);
const opcPickTarget = ref<
  | "parameter"
  | "table"
  | { kind: "tableSql"; slot: number }
  | { kind: "scalarSqlParam"; slot: number }
  | { kind: "scalarSqlCell"; slot: number }
  | null
>(null);

function openOpcPicker(target: "parameter" | "table") {
  opcPickTarget.value = target;
  opcPickOpen.value = true;
}

function ensureZoneTableSqlFill(el: LayoutZoneElement): TableSqlFillConfig {
  if (el.type !== "table") return defaultTableSqlFillConfig();
  if (!el.tableSqlFill) el.tableSqlFill = defaultTableSqlFillConfig();
  ensureZoneTableGrid(el);
  return el.tableSqlFill;
}

function openZoneSqlOpcPicker(slot: number) {
  // 允许负数哨兵槽位（TABLE_SQL_FILL_TABLE_PICK_SLOT = 表名 OPC 变量）
  const s = Math.floor(Number(slot)) || 0;
  opcPickTarget.value = { kind: "tableSql", slot: s };
  opcPickOpen.value = true;
}

function ensureZoneElementSqlParams(el: LayoutZoneElement): TableSqlParamBinding[] {
  if (!Array.isArray(el.sqlParams)) el.sqlParams = [];
  ensureSqlParamSlots(el.sqlParams, 2);
  return el.sqlParams;
}

function ensureZoneTableCellSqlParams(cell: { sqlParams?: TableSqlParamBinding[] }): TableSqlParamBinding[] {
  if (!Array.isArray(cell.sqlParams)) cell.sqlParams = [];
  ensureSqlParamSlots(cell.sqlParams, 2);
  return cell.sqlParams;
}

function openZoneScalarSqlParamOpcPicker(slot: number) {
  const el = props.el;
  if (!el || el.type !== "parameter") return;
  ensureZoneElementSqlParams(el);
  opcPickTarget.value = { kind: "scalarSqlParam", slot };
  opcPickOpen.value = true;
}

function openZoneTableCellSqlParamOpcPicker(slot: number) {
  const cell = activeTableCell.value;
  if (!cell) return;
  ensureZoneTableCellSqlParams(cell);
  opcPickTarget.value = { kind: "scalarSqlCell", slot };
  opcPickOpen.value = true;
}

function onZoneSqlFillSyncHeaders() {
  const el = props.el;
  if (!el || el.type !== "table" || !el.tableSqlFill?.enabled) return;
  syncResultColumnNamesFromFirstRow(el.tableSqlFill, ensureZoneTableGrid(el), el.tableCols ?? 4);
}

const tableDimRows = ref(3);
const tableDimCols = ref(4);
const editCellRow = ref(0);
const editCellCol = ref(0);

watch(
  () => props.el?.id,
  () => {
    const el = props.el;
    if (!el || el.type !== "table") return;
    ensureZoneTableGrid(el);
    tableDimRows.value = el.tableRows ?? 3;
    tableDimCols.value = el.tableCols ?? 4;
  },
  { immediate: true },
);

watch(
  () => (props.el?.type === "table" ? props.el.tableRows : undefined),
  (rows) => {
    const el = props.el;
    if (!el || el.type !== "table" || rows == null) return;
    if (tableDimRows.value !== rows) tableDimRows.value = rows;
  },
);

watch(
  () => [layoutTablePick?.value ?? null, props.el?.id, props.el?.type] as const,
  ([pick, id, typ]) => {
    if (typ !== "table") return;
    if (pick && id && pick.elId === id) {
      editCellRow.value = pick.row;
      editCellCol.value = pick.col;
    } else {
      editCellRow.value = 0;
      editCellCol.value = 0;
    }
  },
  { immediate: true },
);

const activeTableCell = computed(() => {
  const el = props.el;
  if (!el || el.type !== "table") return null;
  const g = el.tableCells;
  if (!Array.isArray(g) || g.length === 0) return null;
  return g[editCellRow.value]?.[editCellCol.value] ?? null;
});

const zoneTableCellSqlParams = computed(() => {
  const cell = activeTableCell.value;
  if (!cell || cell.bindingKind !== "sql") return [];
  return ensureZoneTableCellSqlParams(cell);
});

const zoneTableCellScalarFillMode = computed<ScalarSqlFillMode>({
  get() {
    const cell = activeTableCell.value;
    if (!cell) return "visual";
    return normalizeScalarSqlFillMode(cell.scalarSqlFillMode, cell.sqlText);
  },
  set(v) {
    const cell = activeTableCell.value;
    if (cell) cell.scalarSqlFillMode = v;
  },
});

const zoneTableCellScalarVisual = computed<ScalarSqlVisualConfig>({
  get() {
    // 不在 getter 中回写：仅点开面板不应把版式标记为已修改
    return hydrateScalarSqlVisual(activeTableCell.value?.scalarSqlVisual);
  },
  set(v) {
    const cell = activeTableCell.value;
    if (cell) cell.scalarSqlVisual = v;
  },
});

const hasTableCellPicked = computed(() => {
  const el = props.el;
  const pick = layoutTablePick?.value;
  return !!el && el.type === "table" && !!pick && pick.elId === el.id;
});

const activeTableCellFill = computed({
  get(): string {
    return activeTableCell.value?.bgColor ?? "transparent";
  },
  set(v: string) {
    const cell = activeTableCell.value;
    if (cell) cell.bgColor = v;
  },
});

const zoneSqlFillEnabled = computed(
  () => !!props.el && props.el.type === "table" && !!props.el.tableSqlFill?.enabled,
);

const zoneAnyCellBinding = computed(() => {
  const el = props.el;
  if (!el || el.type !== "table") return false;
  ensureZoneTableGrid(el);
  return gridHasNonNoneBinding(el.tableCells);
});

const zoneSqlFillSwitchLocked = computed(() => zoneAnyCellBinding.value && !zoneSqlFillEnabled.value);

function onZoneSqlFillToggle() {
  const el = props.el;
  if (!el || el.type !== "table") return;
  const cfg = ensureZoneTableSqlFill(el);
  if (cfg.enabled) {
    cfg.enabled = false;
    return;
  }
  ensureZoneTableGrid(el);
  if (gridHasNonNoneBinding(el.tableCells)) return;
  clearGridCellBindings(el.tableCells);
  cfg.enabled = true;
}

watch(
  () => (props.el?.type === "table" ? props.el.tableCells : null),
  () => {
    const el = props.el;
    if (!el || el.type !== "table" || !el.tableSqlFill?.enabled) return;
    ensureZoneTableGrid(el);
    if (gridHasNonNoneBinding(el.tableCells)) el.tableSqlFill.enabled = false;
  },
  { deep: true },
);

const zoneTableColumnInnerWidths = computed(() => {
  const el = props.el;
  if (!el || el.type !== "table") return [];
  ensureZoneTableGrid(el);
  return zoneTableColumnInnerWidthsPx(el);
});

function onZoneTableColumnResizeFromProps(boundaryIndex: number, deltaLayoutPx: number) {
  const el = props.el;
  if (!el || el.type !== "table") return;
  ensureZoneTableGrid(el);
  const u = zonePresetTableCellMetric.value;
  if (!u) return;
  const cols = el.tableCols ?? 4;
  const next = applyTableColumnResizeDeltaPx(u.innerW, cols, el.tableColWidthsPx, boundaryIndex, deltaLayoutPx);
  if (!next) return;
  el.tableColWidthsPx = next;
  ensureZoneTableGrid(el);
  clampZoneTableOuterSize(el);
}

const zonePresetTableCellMetric = computed(() => {
  const el = props.el;
  if (!el || el.type !== "table") return null;
  ensureZoneTableGrid(el);
  return uniformTableCellBoxPx({
    outerW: el.w,
    outerH: el.h,
    rowCount: el.tableRows ?? 3,
    colCount: el.tableCols ?? 4,
    nodePadding: REPORT_ZONE_TABLE_NODE_PADDING_PX,
  });
});

const zoneTableRowHeightModel = computed({
  get(): number {
    const el = props.el;
    if (!el || el.type !== "table") return TABLE_ROW_HEIGHT_DEFAULT_PX;
    return clampTableRowHeightPx(el.tableRowHeightPx);
  },
  set(v: number) {
    const el = props.el;
    if (!el || el.type !== "table") return;
    el.tableRowHeightPx = clampTableRowHeightPx(v);
    clampZoneTableOuterSize(el);
  },
});

function onOpcPickConfirm(payload: string | { serverId: string; nodeId: string }) {
  const t = opcPickTarget.value;
  opcPickTarget.value = null;
  const id = (typeof payload === "string" ? payload : payload.nodeId).trim();
  if (!id) return;
  const el = props.el;
  if (t === "parameter" && el?.type === "parameter") {
    el.bindingKind = "opcua";
    el.opcuaNodeId = id;
    return;
  }
  if (typeof t === "object" && t?.kind === "scalarSqlParam" && el?.type === "parameter") {
    const params = ensureZoneElementSqlParams(el);
    ensureSqlParamSlots(params, t.slot + 1);
    const row = params[t.slot];
    if (row) {
      row.source = "opcua";
      row.opcuaNodeId = id;
    }
    return;
  }
  if (typeof t === "object" && t?.kind === "scalarSqlCell" && el?.type === "table") {
    const cell = activeTableCell.value;
    if (!cell) return;
    const params = ensureZoneTableCellSqlParams(cell);
    ensureSqlParamSlots(params, t.slot + 1);
    const row = params[t.slot];
    if (row) {
      row.source = "opcua";
      row.opcuaNodeId = id;
    }
    return;
  }
  if (typeof t === "object" && t?.kind === "tableSql" && el?.type === "table") {
    // 可视化模式写入筛选条件的绑定（面板显示来源）；手写模式写入 params 槽位
    applyTableSqlFillOpcPick(ensureZoneTableSqlFill(el), t.slot, id);
    return;
  }
  if (t === "table" && el?.type === "table") {
    const cell = activeTableCell.value;
    if (cell) {
      cell.bindingKind = "opcua";
      cell.opcuaNodeId = id;
    }
  }
}

function clampTableDimInput(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(30, Math.max(1, Math.floor(n)));
}

function bumpTableDimRows(delta: number) {
  const el = props.el;
  if (!el || el.type !== "table") return;
  if (zoneSqlFillEnabled.value) return;
  tableDimRows.value = clampTableDimInput((Number(tableDimRows.value) || 1) + delta);
}

function bumpTableDimCols(delta: number) {
  const el = props.el;
  if (!el || el.type !== "table") return;
  tableDimCols.value = clampTableDimInput((Number(tableDimCols.value) || 1) + delta);
}

function bumpZoneTableRowHeight(delta: number) {
  const el = props.el;
  if (!el || el.type !== "table") return;
  const cur = clampTableRowHeightPx(el.tableRowHeightPx);
  el.tableRowHeightPx = clampTableRowHeightPx(cur + delta);
  clampZoneTableOuterSize(el);
}

function applyTableDims() {
  const el = props.el;
  if (!el || el.type !== "table") return;
  if (!zoneSqlFillEnabled.value) {
    el.tableRows = clampTableDimInput(tableDimRows.value);
  }
  el.tableCols = clampTableDimInput(tableDimCols.value);
  tableDimRows.value = el.tableRows;
  tableDimCols.value = el.tableCols;
  ensureZoneTableGrid(el);
  if (editCellRow.value >= el.tableRows) editCellRow.value = el.tableRows - 1;
  if (editCellCol.value >= el.tableCols) editCellCol.value = el.tableCols - 1;
  clampZoneTableOuterSize(el);
}

watch([tableDimRows, tableDimCols], ([rows, cols]) => {
  if (props.el?.type !== "table") return;
  if (!Number.isFinite(rows) || !Number.isFinite(cols)) return;
  applyTableDims();
});

const dateFormatSelectValue = computed(() => {
  const el = props.el;
  if (!el || el.type !== "date") return "yyyy-MM-dd";
  const t = (el.dateFormat || "").trim();
  const hit = DATE_FORMAT_PRESETS.find((p) => p.value === t);
  return hit ? hit.value : "__custom__";
});

const dateFormatIsCustom = computed(() => dateFormatSelectValue.value === "__custom__");

function onDateFormatPresetChange(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const el = props.el;
  if (!el || el.type !== "date" || v === "__custom__") return;
  el.dateFormat = v;
}

const imgFileEl = ref<HTMLInputElement | null>(null);

defineEmits<{
  remove: [];
}>();

async function pickLocalImage() {
  const row = props.el;
  if (!row || row.type !== "image") return;
  await nextTick();
  imgFileEl.value?.click();
}

async function onLocalImageChosen(ev: Event) {
  const row = props.el;
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  if (!row || row.type !== "image" || !f) return;
  try {
    row.imageSrc = await readImageFileAsDataUrl(f);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
.lpep-h {
  margin: 0 0 8px;
  font-size: 13px;
}
.lpep-type-tag {
  margin: 0 0 10px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #4338ca;
  background: rgb(238 242 255);
  border: 1px solid rgb(199 210 254 / 0.85);
  border-radius: 6px;
  width: fit-content;
  max-width: 100%;
}
.lpep-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.lpep-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lpep-wrap-row {
  gap: 6px;
}
.lpep-wrap-title {
  font-size: 12px;
  color: #52525b;
}
.lpep-seg {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  overflow: hidden;
  background: #fafafa;
}
.lpep-seg-btn {
  margin: 0;
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  line-height: 1.2;
}
.lpep-seg-btn + .lpep-seg-btn {
  box-shadow: inset 1px 0 0 #e4e4e7;
}
.lpep-seg-btn:hover:not(.lpep-seg-on) {
  background: rgb(244 244 245 / 0.85);
  color: #18181b;
}
.lpep-seg-on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.lpep-wrap-hint {
  margin: 0;
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.35;
}
.lpep-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
}
.lpep-del {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgb(239 68 68);
  color: rgb(185 28 28);
  background: #fff;
  cursor: pointer;
}
.lpep-file-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  align-self: flex-start;
}
.lpep-img-hint {
  font-size: 11px;
  color: #71717a;
  line-height: 1.4;
}
.lpep-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.lpep-grey {
  font-size: 13px;
  color: #71717a;
}
.lpep-hint-muted {
  margin: 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.45;
}
.lpep-table-metric {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  color: #3f3f46;
  background: rgb(244 244 245 / 0.95);
  border: 1px solid #e4e4e7;
  border-radius: 8px;
}
.lpep-table-metric strong {
  color: #4338ca;
  font-weight: 700;
}
.lpep-table-dims {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 14px;
}
.lpep-table-col-widths {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lpep-table-col-widths-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: flex-end;
}
.lpep-table-col-w-lab {
  min-width: 4.5rem;
  font-weight: 600;
}
.lpep-table-col-w-inp {
  max-width: 5rem;
}
.lpep-dim-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.lpep-dim-title {
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.lpep-dim-stepper {
  display: inline-flex;
  align-items: stretch;
  border-radius: 10px;
  border: 1px solid #d4d4d8;
  overflow: hidden;
  background: #fafafa;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.06);
}
.lpep-dim-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  background: #fff;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  color: #4338ca;
  cursor: pointer;
  touch-action: manipulation;
  flex-shrink: 0;
}
.lpep-dim-btn:hover:not(:disabled) {
  background: #eef2ff;
  color: #3730a3;
}
.lpep-dim-btn:active:not(:disabled) {
  background: #e0e7ff;
}
.lpep-dim-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  color: #a1a1aa;
}
.lpep-dim-val {
  width: 3.25rem;
  box-sizing: border-box;
  text-align: center;
  border: none;
  border-left: 1px solid #e4e4e7;
  border-right: 1px solid #e4e4e7;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: #fff;
  color: #18181b;
  padding: 0 4px;
  min-height: 44px;
}
.lpep-dim-val:focus {
  outline: none;
  background: #fafafa;
}
.lpep-dim-val::-webkit-outer-spin-button,
.lpep-dim-val::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.lpep-dim-val {
  appearance: textfield;
  -moz-appearance: textfield;
}
.lpep-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.lpep-table-cell-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed #e4e4e7;
}
.lpep-opc-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}
.lpep-opc-row-grow {
  flex: 1;
  min-width: 160px;
}
.lpep-opc-pickbtn {
  flex-shrink: 0;
  align-self: flex-end;
}
.lpep-opc-quick {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lpep-table-sql-fill-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e4e4e7;
}
.lpep-sql-fill-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lpep-sql-fill-title {
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.lpep-switch {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: 1px solid #d4d4d8;
  background: #e4e4e7;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.lpep-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.15);
  transition: transform 0.15s ease;
}
.lpep-switch--on {
  background: #a5b4fc;
  border-color: #818cf8;
}
.lpep-switch--on::after {
  transform: translateX(18px);
}
.lpep-switch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
