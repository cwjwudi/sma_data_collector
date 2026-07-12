<template>
  <div class="zts-wrap">
    <table class="zts-table" :style="{ background: innerBg }">
      <colgroup>
        <col v-for="(cw, ci) in colWidths" :key="'ztsc-' + el.id + '-' + ci" :style="{ width: cw + 'px' }" />
      </colgroup>
      <tbody>
        <tr v-for="(row, ri) in grid" :key="'ztsr-' + el.id + '-' + ri" :style="trStyleAt(ri)">
          <td
            v-for="(cell, ci) in row"
            :key="'ztsd-' + el.id + '-' + ri + '-' + ci"
            class="zts-td"
            :style="tdStyle(ri, ci, cell)"
            :title="cellTitle(ri, ci, cell)"
          >
            {{ cellText(ri, ci, cell) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import {
  computeZoneTableContentRowHeightsPx,
  ensureZoneTableGrid,
  resolveTableCellBackgroundCss,
  zoneTableColumnInnerWidthsPx,
  zoneTableInnerBackgroundCss,
  type LayoutZoneElement,
  type LayoutZoneTableCell,
} from "@/lib/report-template/layout-zone-element";
import { clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";
import {
  resolveStaticTableCellDisplayText,
  resolveStaticTableCellLayoutText,
  shortBindingKindLabel,
  staticTableCellBindingTitle,
} from "@/lib/report-template/binding-preview-utils";
import { reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";

/** 编辑画布上只读展示版式区/装饰层表格（拖拽编辑请在对应编辑器进行） */
const props = defineProps<{
  el: LayoutZoneElement;
}>();

const bindingPreview = inject(reportBindingPreviewKey, null);

const grid = computed<LayoutZoneTableCell[][]>(() => ensureZoneTableGrid(props.el));

const colWidths = computed(() => zoneTableColumnInnerWidthsPx(props.el));

const innerBg = computed(() => zoneTableInnerBackgroundCss(props.el.bgColor));

function zoneCellKey(ri: number, ci: number): string {
  return `zone-cell:${props.el.id}:${ri}:${ci}`;
}

function layoutTextAt(ri: number, ci: number): string {
  const cell = grid.value[ri]?.[ci] ?? null;
  const hit = bindingPreview?.values.value[zoneCellKey(ri, ci)];
  return resolveStaticTableCellLayoutText({
    cell,
    previewCell: hit,
    loading: !!(bindingPreview?.loading.value && !hit),
  });
}

const rowHeights = computed(() => {
  // 依赖预览值以便实值更新后重算行高
  void bindingPreview?.values.value;
  if (props.el.tableSqlFill?.enabled) {
    const n = Math.max(1, props.el.tableRows ?? 1);
    const h = clampTableRowHeightPx(props.el.tableRowHeightPx);
    return Array.from({ length: n }, () => h);
  }
  return computeZoneTableContentRowHeightsPx(props.el, layoutTextAt);
});

function trStyleAt(ri: number): Record<string, string> {
  const h = rowHeights.value[ri] ?? clampTableRowHeightPx(props.el.tableRowHeightPx);
  return { height: `${h}px`, minHeight: `${h}px` };
}

function cellText(ri: number, ci: number, cell: LayoutZoneTableCell): string {
  const fill = props.el.tableSqlFill;
  if (fill?.enabled) {
    return formatSqlFillTableCellPreview({
      fill,
      rowIndex: ri,
      colIndex: ci,
      preview: null,
      previewLoading: false,
    });
  }
  const hit = bindingPreview?.values.value[zoneCellKey(ri, ci)];
  const loading = !!(bindingPreview?.loading.value && !hit);
  if (cell.bindingKind === "opcua" || cell.bindingKind === "sql" || cell.bindingKind === "mongo") {
    return resolveStaticTableCellDisplayText({
      cell,
      previewCell: hit,
      loading,
      unboundLabel: shortBindingKindLabel(cell.bindingKind),
    });
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function cellTitle(ri: number, ci: number, cell: LayoutZoneTableCell): string {
  if (props.el.tableSqlFill?.enabled) return "";
  const hit = bindingPreview?.values.value[zoneCellKey(ri, ci)];
  if (hit != null) return "";
  return staticTableCellBindingTitle(cell);
}

function tdStyle(ri: number, ci: number, cell: LayoutZoneTableCell): Record<string, string> {
  const rows = grid.value.length;
  const cols = grid.value[ri]?.length ?? 0;
  const edge = "1px solid rgb(212 212 216)";
  const s: Record<string, string> = {
    borderTop: edge,
    borderLeft: edge,
    backgroundColor: resolveTableCellBackgroundCss(
      { tableBgColor: props.el.bgColor, tableColBgColors: props.el.tableColBgColors },
      ci,
      cell,
    ),
  };
  if (ci === cols - 1) s.borderRight = edge;
  if (ri === rows - 1) s.borderBottom = edge;
  return s;
}
</script>

<style scoped>
.zts-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  /* 底侧多 1px，避免最后一行底边框被 overflow:hidden 裁掉 */
  padding-bottom: 1px;
}
.zts-table {
  width: 100%;
  height: auto;
  max-height: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}
.zts-td {
  padding: 2px 4px;
  box-sizing: border-box;
  height: inherit;
  text-align: center;
  vertical-align: middle;
  overflow: hidden;
  font-size: max(10px, 0.85em);
  line-height: 1.25;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
