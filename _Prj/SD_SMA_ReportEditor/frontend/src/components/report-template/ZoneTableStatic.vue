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
          >
            {{ cellText(ri, ci, cell) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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

/** 编辑画布上只读展示版式区/装饰层表格（拖拽编辑请在对应编辑器进行） */
const props = defineProps<{
  el: LayoutZoneElement;
}>();

const grid = computed<LayoutZoneTableCell[][]>(() => ensureZoneTableGrid(props.el));

const colWidths = computed(() => zoneTableColumnInnerWidthsPx(props.el));

const innerBg = computed(() => zoneTableInnerBackgroundCss(props.el.bgColor));

const rowHeights = computed(() => {
  if (props.el.tableSqlFill?.enabled) {
    const n = Math.max(1, props.el.tableRows ?? 1);
    const h = clampTableRowHeightPx(props.el.tableRowHeightPx);
    return Array.from({ length: n }, () => h);
  }
  return computeZoneTableContentRowHeightsPx(props.el);
});

function trStyleAt(ri: number): Record<string, string> {
  const h = rowHeights.value[ri] ?? clampTableRowHeightPx(props.el.tableRowHeightPx);
  return { height: `${h}px`, minHeight: `${h}px` };
}

function truncate(s: string, n: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= n ? x : `${x.slice(0, n)}…`;
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
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${truncate(id, 48)}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${truncate(q, 36)}` : "⟨SQL⟩";
  }
  if (cell.bindingKind === "mongo") {
    const col = cell.mongoQuery?.collection?.trim() || "";
    return col ? `⟨Mongo⟩ ${truncate(col, 36)}` : "⟨Mongo⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
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
