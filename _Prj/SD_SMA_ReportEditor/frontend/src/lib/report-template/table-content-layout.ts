/**
 * 表格编辑/预览共用：内容换行感知行高、超页切行（含行内跨页断行）。
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
  takeLogicalRowLinesForAvail,
  TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
} from "@/lib/report-template/table-cell-metrics";
import { tableSqlFillVerticalChromePx } from "@/lib/report-template/table-sql-fill-layout-utils";
import type { TablePreviewRowSlice } from "@/lib/report-template/table-preview-row-slice";

export type { TablePreviewRowSlice } from "@/lib/report-template/table-preview-row-slice";

/** 估算用单元格文案：静态文本用 cell.text；绑定格无注入时用短占位（勿用 NodeId 估行高） */
export function formatTableCellTextForHeightEstimate(cell: TemplateTableCell | null | undefined): string {
  if (!cell) return "";
  if (cell.bindingKind === "opcua" || cell.bindingKind === "sql" || cell.bindingKind === "mongo") {
    return "";
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
  opts?: { uncapped?: boolean },
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
    maxRowHeightPx: opts?.uncapped ? TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX : undefined,
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
 * 按可变行高在 availOuterPx（含 chrome）内能放下的**整行**数。
 * 首行装不下时返回 0（不再强塞 1 行裁切）；由上层行内拆分或换页处理。
 */
export function rowsFitInAvailWithHeights(
  availOuterPx: number,
  heights: number[],
  fallbackRowH: number,
): number {
  const usable = Math.max(0, availOuterPx - tableSqlFillVerticalChromePx());
  const fb = Math.max(1, clampTableRowHeightPx(fallbackRowH));
  if (!heights.length) {
    return Math.max(0, Math.floor(usable / fb));
  }
  let used = 0;
  let n = 0;
  for (const h of heights) {
    const hh = Math.max(1, h);
    if (used + hh > usable) break;
    used += hh;
    n += 1;
  }
  return n;
}

export type SplitRowForAvail = (
  rowIndex: number,
  availInnerPx: number,
  lineStart: number,
) => { lineEnd: number; heightPx: number; totalLines: number } | null;

/**
 * 静态表超页切片：整行打包 + 装不下时行内视觉行拆分。
 * dataRowStart 为网格绝对行下标。
 */
export function buildLogicalRowSlicesForOverflow(opts: {
  rowHeights: number[];
  firstPageAvailOuterPx: number;
  nextPageAvailOuterPx: number;
  fallbackRowH: number;
  /** 行内拆分；缺省时超高行只能整行换到能放下的页（仍可能超整页裁切） */
  splitRow?: SplitRowForAvail;
}): TablePreviewRowSlice[] {
  const { rowHeights, firstPageAvailOuterPx, nextPageAvailOuterPx, fallbackRowH, splitRow } = opts;
  const total = rowHeights.length;
  if (total <= 0) return [];
  const chrome = tableSqlFillVerticalChromePx();
  const slices: TablePreviewRowSlice[] = [];
  let cursor = 0;
  let lineStart = 0;
  let first = true;
  let guard = 0;
  const maxGuard = Math.max(64, total * 64);

  while (cursor < total && guard++ < maxGuard) {
    const availOuter = first ? firstPageAvailOuterPx : nextPageAvailOuterPx;
    const usable = Math.max(0, availOuter - chrome);

    // 续写同一逻辑行
    if (lineStart > 0) {
      if (!splitRow) {
        lineStart = 0;
        cursor += 1;
        first = false;
        continue;
      }
      const frag = splitRow(cursor, usable, lineStart);
      if (!frag || frag.lineEnd <= lineStart) {
        if (first) {
          first = false;
          continue;
        }
        // 整页仍放不下单行文本：推进一行避免死循环（极端）
        lineStart = 0;
        cursor += 1;
        first = false;
        continue;
      }
      const isFrag = lineStart > 0 || frag.lineEnd < frag.totalLines;
      slices.push({
        dataRowStart: cursor,
        dataRowCount: 1,
        includeHeaderRow: false,
        rowTextLineStart: lineStart,
        rowTextLineEnd: frag.lineEnd,
        rowFragment: isFrag || undefined,
      });
      if (frag.lineEnd >= frag.totalLines) {
        cursor += 1;
        lineStart = 0;
      } else {
        lineStart = frag.lineEnd;
      }
      first = false;
      continue;
    }

    const rest = rowHeights.slice(cursor);
    let take = rowsFitInAvailWithHeights(availOuter, rest, fallbackRowH);
    take = Math.min(take, total - cursor);

    if (take > 0) {
      slices.push({
        dataRowStart: cursor,
        dataRowCount: take,
        includeHeaderRow: false,
      });
      cursor += take;
      first = false;
      continue;
    }

    // 当前剩余放不下任何整行
    const rowH = Math.max(1, rowHeights[cursor] ?? clampTableRowHeightPx(fallbackRowH));
    if (splitRow && rowH > usable) {
      const frag = splitRow(cursor, usable, 0);
      if (frag && frag.lineEnd > 0) {
        const isFrag = frag.lineEnd < frag.totalLines;
        slices.push({
          dataRowStart: cursor,
          dataRowCount: 1,
          includeHeaderRow: false,
          rowTextLineStart: 0,
          rowTextLineEnd: frag.lineEnd,
          rowFragment: isFrag || undefined,
        });
        if (frag.lineEnd >= frag.totalLines) {
          cursor += 1;
          lineStart = 0;
        } else {
          lineStart = frag.lineEnd;
        }
        first = false;
        continue;
      }
    }

    // 剩余太小：换到下一整页
    if (first) {
      first = false;
      continue;
    }

    // 整页仍装不下且无 split：退化强塞一行（避免死循环；有 split 时不应落到此）
    slices.push({
      dataRowStart: cursor,
      dataRowCount: 1,
      includeHeaderRow: false,
    });
    cursor += 1;
    lineStart = 0;
    first = false;
  }

  return slices;
}

/** 构造静态表 splitRow 回调（与估高同源折行） */
export function makeStaticTableSplitRow(
  el: TemplateElement,
  cellTextAt?: (ri: number, ci: number) => string,
): SplitRowForAvail {
  ensureTableGrid(el);
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
  const cols = colWidths.length;

  return (rowIndex, availInnerPx, lineStart) => {
    const cellTexts = Array.from({ length: cols }, (_, ci) => {
      if (cellTextAt) return cellTextAt(rowIndex, ci);
      return formatTableCellTextForHeightEstimate(grid[rowIndex]?.[ci]);
    });
    const taken = takeLogicalRowLinesForAvail({
      cellTexts,
      colWidthsPx: colWidths,
      fontSizePx: fontSize,
      lineHeight: 1.3,
      paddingX: 10,
      paddingY: 6,
      minHeightPx: minH,
      availInnerPx,
      lineStart,
    });
    if (!taken) return null;
    return {
      lineEnd: taken.lineEnd,
      heightPx: taken.heightPx,
      totalLines: taken.totalLines,
    };
  };
}
