/**
 * SQL 整表填充：画布排版与预览分页共用的几何判断。
 */

import type { TemplateElement } from "@/lib/report-template/model";
import { REPORT_TEMPLATE_TABLE_NODE_PADDING_PX, clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";

/** 表格外壳纵向占位（与 intrinsicOuterHeightForTemplateTable 一致） */
export function tableSqlFillVerticalChromePx(): number {
  const p = REPORT_TEMPLATE_TABLE_NODE_PADDING_PX;
  const shellBottomPadPx = 1;
  return p.top + p.bottom + shellBottomPadPx;
}

/** 估算「表头顶边 → 结果集最后一行底边」的文档 y（正文区内坐标） */
export function estimatedSqlFillTableBottomY(el: TemplateElement, dataRowCount: number): number {
  if (el.type !== "table") return el.y + el.h;
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  return el.y + tableSqlFillVerticalChromePx() + (1 + Math.max(0, dataRowCount)) * rowH;
}

export function tplElementsHorizontallyOverlap(a: TemplateElement, b: TemplateElement): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x);
}

/** SQL 填充表格片段外框高度（px） */
export function sqlFillSliceTableOuterHeightPx(
  el: TemplateElement,
  slice: { includeHeaderRow: boolean; dataRowCount: number },
): number | undefined {
  if (!slice || el.type !== "table") return undefined;
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const rows = (slice.includeHeaderRow ? 1 : 0) + slice.dataRowCount;
  return tableSqlFillVerticalChromePx() + rows * rowH;
}
