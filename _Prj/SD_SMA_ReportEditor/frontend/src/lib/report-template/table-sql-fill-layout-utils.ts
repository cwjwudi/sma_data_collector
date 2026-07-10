/**
 * SQL 整表填充：画布排版与预览分页共用的几何判断。
 */

import type { TemplateElement } from "@/lib/report-template/model";
import { templateTableColumnInnerWidthsPx } from "@/lib/report-template/model";
import {
  REPORT_TEMPLATE_TABLE_NODE_PADDING_PX,
  clampTableRowHeightPx,
  computeContentAwareTableRowHeightsPx,
  sumTableRowHeightsPx,
} from "@/lib/report-template/table-cell-metrics";
import type { TableSqlFillPreviewPayload } from "@/lib/report-template/binding-preview-utils";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";

/** 表格外壳纵向占位（与 intrinsicOuterHeightForTemplateTable 一致） */
export function tableSqlFillVerticalChromePx(): number {
  const p = REPORT_TEMPLATE_TABLE_NODE_PADDING_PX;
  const shellBottomPadPx = 1;
  return p.top + p.bottom + shellBottomPadPx;
}

/** 逻辑行高度列表：表头 + 数据行（内容换行感知） */
export function computeSqlFillLogicalRowHeightsPx(
  el: TemplateElement,
  preview: TableSqlFillPreviewPayload | null | undefined,
  displayDataRowCount: number,
  previewSlice?: { dataRowStart: number; dataRowCount: number; includeHeaderRow: boolean } | null,
): number[] {
  if (el.type !== "table") return [];
  const minH = clampTableRowHeightPx(el.tableRowHeightPx);
  const dataN = Math.max(0, Math.floor(Number(displayDataRowCount) || 0));
  const includeHeader = previewSlice ? previewSlice.includeHeaderRow !== false : true;
  const logicalRows = (includeHeader ? 1 : 0) + (previewSlice ? previewSlice.dataRowCount : dataN);
  if (logicalRows <= 0) return [];

  let colWidths: number[] = [];
  try {
    colWidths = templateTableColumnInnerWidthsPx(el);
  } catch {
    colWidths = [];
  }
  if (!colWidths.length) {
    const cols = el.tableCols ?? 4;
    const inner = Math.max(40, (el.w || 200) - 8);
    colWidths = Array.from({ length: cols }, () => Math.floor(inner / cols));
  }

  const fontSize = Math.max(10, (el.fontSize || 12) * 0.85);
  const fill = el.tableSqlFill;
  if (!fill?.enabled) {
    return Array.from({ length: logicalRows }, () => minH);
  }

  return computeContentAwareTableRowHeightsPx({
    rowCount: logicalRows,
    colWidthsPx: colWidths,
    fontSizePx: fontSize,
    minRowHeightPx: minH,
    lineHeight: 1.3,
    paddingX: 10,
    paddingY: 6,
    cellTextAt: (ri, ci) =>
      formatSqlFillTableCellPreview({
        fill,
        rowIndex: ri,
        colIndex: ci,
        preview: preview ?? null,
        previewLoading: false,
        errorMaxLen: 500,
        previewSlice: previewSlice ?? undefined,
      }),
  });
}

/** 估算「表头顶边 → 结果集最后一行底边」的文档 y（正文区内坐标） */
export function estimatedSqlFillTableBottomY(
  el: TemplateElement,
  dataRowCount: number,
  rowHeightsPx?: number[] | null,
): number {
  if (el.type !== "table") return el.y + el.h;
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const rows = 1 + Math.max(0, dataRowCount);
  const body = sumTableRowHeightsPx(rowHeightsPx ?? [], rowH, rows);
  return el.y + tableSqlFillVerticalChromePx() + body;
}

export function tplElementsHorizontallyOverlap(a: TemplateElement, b: TemplateElement): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x);
}

/** SQL 填充表格片段外框高度（px） */
export function sqlFillSliceTableOuterHeightPx(
  el: TemplateElement,
  slice: { includeHeaderRow: boolean; dataRowCount: number },
  rowHeightsPx?: number[] | null,
): number | undefined {
  if (!slice || el.type !== "table") return undefined;
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const rows = (slice.includeHeaderRow ? 1 : 0) + slice.dataRowCount;
  const body = sumTableRowHeightsPx(rowHeightsPx ?? [], rowH, rows);
  return tableSqlFillVerticalChromePx() + body;
}
