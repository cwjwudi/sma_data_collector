/**
 * 表格编辑/预览共用：内容换行感知行高、超页切行。
 */

import type { TemplateElement, TemplateTableCell } from "@/lib/report-template/model";
import {
  ensureTableGrid,
  intrinsicOuterHeightForTemplateTable,
  templateTableColumnInnerWidthsPx,
} from "@/lib/report-template/model";
import {
  clampTableRowHeightPx,
  computeContentAwareTableRowHeightsPx,
  sumTableRowHeightsPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
} from "@/lib/report-template/table-cell-metrics";
import { tableSqlFillVerticalChromePx } from "@/lib/report-template/table-sql-fill-layout-utils";

/** 估算用单元格文案（与编辑画布绑定标签口径接近，不做截断以免低估行高） */
export function formatTableCellTextForHeightEstimate(cell: TemplateTableCell | null | undefined): string {
  if (!cell) return "";
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${id}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${q}` : "⟨SQL⟩";
  }
  if (cell.bindingKind === "mongo") {
    const col = cell.mongoQuery?.collection?.trim() || "";
    return col ? `⟨Mongo⟩ ${col}` : "⟨Mongo⟩";
  }
  return (cell.text || "").trim();
}

/**
 * 静态表按列宽估算各逻辑行高度。
 * `cellTextAt` 可注入绑定预览实值；缺省用网格内配置文案。
 */
export function computeTemplateTableContentRowHeightsPx(
  el: TemplateElement,
  cellTextAt?: (ri: number, ci: number) => string,
): number[] {
  if (el.type !== "table") return [];
  ensureTableGrid(el);
  const rows = Math.max(1, el.tableRows ?? 3);
  const minH = clampTableRowHeightPx(el.tableRowHeightPx);
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
  const grid = el.tableCells || [];
  return computeContentAwareTableRowHeightsPx({
    rowCount: rows,
    colWidthsPx: colWidths,
    fontSizePx: fontSize,
    minRowHeightPx: minH,
    lineHeight: 1.3,
    paddingX: 10,
    paddingY: 6,
    cellTextAt: (ri, ci) => {
      if (cellTextAt) return cellTextAt(ri, ci);
      return formatTableCellTextForHeightEstimate(grid[ri]?.[ci]);
    },
  });
}

export function outerHeightFromTableRowHeightsPx(
  heights: number[],
  fallbackRowH: number = TABLE_ROW_HEIGHT_DEFAULT_PX,
): number {
  const body = sumTableRowHeightsPx(heights, clampTableRowHeightPx(fallbackRowH), heights.length);
  return tableSqlFillVerticalChromePx() + body;
}

/** 内容贴合外框高度（不考虑页高裁剪） */
export function contentAwareOuterHeightForTemplateTable(
  el: TemplateElement,
  cellTextAt?: (ri: number, ci: number) => string,
): number {
  return intrinsicOuterHeightForTemplateTable(el, cellTextAt);
}

/** 贴合高度是否超过从表顶到页底的剩余空间 */
export function templateTableExceedsPageRemaining(
  el: TemplateElement,
  contentH: number,
  rowHeightsPx?: number[] | null,
): boolean {
  if (el.type !== "table") return false;
  const heights = rowHeightsPx?.length
    ? rowHeightsPx
    : computeTemplateTableContentRowHeightsPx(el);
  const need = outerHeightFromTableRowHeightsPx(heights, el.tableRowHeightPx);
  const avail = Math.max(0, contentH - el.y);
  return need > avail + 0.5;
}

/**
 * 按可变行高在 availOuterPx（含 chrome）内能放下的行数（至少 1）。
 */
export function rowsFitInAvailWithHeights(
  availOuterPx: number,
  heights: number[],
  fallbackRowH: number,
): number {
  const usable = Math.max(0, availOuterPx - tableSqlFillVerticalChromePx());
  const fb = Math.max(1, clampTableRowHeightPx(fallbackRowH));
  if (!heights.length) {
    return Math.max(1, Math.floor(usable / fb) || 1);
  }
  let used = 0;
  let n = 0;
  for (const h of heights) {
    const hh = Math.max(1, h);
    if (n > 0 && used + hh > usable) break;
    if (n === 0 && hh > usable) return 1;
    used += hh;
    n += 1;
  }
  return Math.max(1, n);
}

/** 静态表超页：按逻辑行切片（dataRowStart 为网格绝对行下标） */
export function buildLogicalRowSlicesForOverflow(opts: {
  rowHeights: number[];
  firstPageAvailOuterPx: number;
  nextPageAvailOuterPx: number;
  fallbackRowH: number;
}): { dataRowStart: number; dataRowCount: number; includeHeaderRow: boolean }[] {
  const { rowHeights, firstPageAvailOuterPx, nextPageAvailOuterPx, fallbackRowH } = opts;
  const total = rowHeights.length;
  if (total <= 0) return [];
  const slices: { dataRowStart: number; dataRowCount: number; includeHeaderRow: boolean }[] = [];
  let cursor = 0;
  let first = true;
  while (cursor < total) {
    const rest = rowHeights.slice(cursor);
    const avail = first ? firstPageAvailOuterPx : nextPageAvailOuterPx;
    let take = rowsFitInAvailWithHeights(avail, rest, fallbackRowH);
    take = Math.min(take, total - cursor);
    if (take <= 0) take = 1;
    slices.push({
      dataRowStart: cursor,
      dataRowCount: take,
      includeHeaderRow: false,
    });
    cursor += take;
    first = false;
  }
  return slices;
}
