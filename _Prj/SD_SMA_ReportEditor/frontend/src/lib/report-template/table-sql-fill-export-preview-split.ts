/**
 * 导出预览栈：数据库整表填充超出正文区高度时，按页拆分多张预览卡片（模拟分页）。
 */

import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages } from "@/lib/report-template/model";
import { clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";
import {
  estimatedSqlFillTableBottomY,
  tableSqlFillVerticalChromePx,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";
import { sqlFillDisplayDataRowCount } from "@/lib/report-template/table-sql-fill-preview";
import {
  isVerticalSqlFill,
  normalizeTableSqlVerticalMultiRecordMode,
} from "@/lib/report-template/table-sql-fill";
import { verticalSqlRecordLogicalRanges, verticalSqlSlotsPerRecord } from "@/lib/report-template/table-sql-vertical";

/** 迷你预览中单张卡片内的表格片段（数据行为预览 payload.dataRows 的下标切片） */
export interface SqlFillTablePreviewSlice {
  dataRowStart: number;
  dataRowCount: number;
  includeHeaderRow: boolean;
}

export interface ExpandedBodyPreviewCard {
  bodyPageIndex: number;
  continuationIndex: number;
  sqlFillTableSlices: Record<string, SqlFillTablePreviewSlice>;
  continuationHideOtherBodyElements: boolean;
  /** 首屏：隐藏与该表横向重叠且 y≥baseline 的控件（移至 tail 卡） */
  sqlFillHideBelow?: { tableId: string; baselineY: number };
  /** 表格最后一页：表下留白并显示提示文案 */
  showSqlFillTailDividerHint?: boolean;
  /** 另起一页仅渲染「表格逻辑底线以下」的正文控件 */
  tailOnlyBelowBaseline?: boolean;
  tailBaselineY?: number;
  overflowSqlFillTableId?: string;
}

function rowsFitInPx(availPx: number, rowH: number): number {
  const usable = Math.max(0, availPx - tableSqlFillVerticalChromePx());
  const n = Math.floor(usable / Math.max(1, rowH));
  return Math.max(1, n);
}

/** 首屏正文区从表格顶部起，能否容纳「1 行表头 + 全部数据行」（导出预览分页判定） */
export function sqlFillTableNeedsPreviewPagination(
  el: TemplateElement,
  dataRowCount: number,
  contentH: number,
  sqlDataRowCount?: number,
): boolean {
  if (el.type !== "table" || dataRowCount <= 0) return false;
  const fill = el.tableSqlFill;
  // 纵表「每条另起一页」：多条 SQL 结果时强制拆页
  if (
    fill &&
    isVerticalSqlFill(fill) &&
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record" &&
    (sqlDataRowCount ?? 0) > 1
  ) {
    return true;
  }
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const capFirst = rowsFitInPx(contentH - el.y, rowH);
  return capFirst < 1 + dataRowCount;
}

function pickSqlFillTableForPreviewPagination(
  els: TemplateElement[],
  contentH: number,
  previewValues: Record<string, BindingPreviewCell | undefined>,
): TemplateElement | null {
  let best: TemplateElement | null = null;
  let bestBottom = -Infinity;
  for (const el of els) {
    if (el.type !== "table" || !el.tableSqlFill?.enabled) continue;
    const pk = templateTableSqlFillPreviewKey(el.id);
    const pv = previewValues[pk]?.tableSqlFill;
    const sqlN = pv?.dataRows?.length ?? 0;
    if (!sqlN || pv?.error) continue;
    const displayN = sqlFillDisplayDataRowCount(el.tableSqlFill, sqlN);
    if (!sqlFillTableNeedsPreviewPagination(el, displayN, contentH, sqlN)) continue;
    const bottom = estimatedSqlFillTableBottomY(el, displayN);
    if (bottom >= bestBottom) {
      bestBottom = bottom;
      best = el;
    }
  }
  return best;
}

function buildSlicesForOverflowTable(
  el: TemplateElement,
  dataRowCount: number,
  contentH: number,
  repeatHeader: boolean,
): SqlFillTablePreviewSlice[] {
  if (el.type !== "table" || dataRowCount <= 0) return [];
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const slices: SqlFillTablePreviewSlice[] = [];

  const availFirst = contentH - el.y;
  const maxRowsFirst = rowsFitInPx(availFirst, rowH);
  let dataCapFirst = Math.max(0, maxRowsFirst - 1);
  if (dataCapFirst === 0 && dataRowCount > 0) dataCapFirst = 1;
  const take0 = Math.min(dataCapFirst, dataRowCount);
  slices.push({ dataRowStart: 0, dataRowCount: take0, includeHeaderRow: true });

  let cursor = take0;
  while (cursor < dataRowCount) {
    const maxRows = rowsFitInPx(contentH, rowH);
    const hdr = repeatHeader ? 1 : 0;
    let dataCap = Math.max(0, maxRows - hdr);
    if (dataCap === 0) dataCap = 1;
    const take = Math.min(dataCap, dataRowCount - cursor);
    if (take <= 0) break;
    slices.push({
      dataRowStart: cursor,
      dataRowCount: take,
      includeHeaderRow: repeatHeader,
    });
    cursor += take;
  }
  return slices;
}

/**
 * 纵表「每条结果另起一页」：每条 SQL 记录单独一张预览卡（可再按页高切分该记录内部）。
 */
function buildSlicesForVerticalPagePerRecord(
  el: TemplateElement,
  sqlDataRowCount: number,
  contentH: number,
  repeatHeader: boolean,
): SqlFillTablePreviewSlice[] {
  if (el.type !== "table" || !el.tableSqlFill || sqlDataRowCount <= 0) return [];
  const fill = el.tableSqlFill;
  const ranges = verticalSqlRecordLogicalRanges(fill, sqlDataRowCount);
  if (!ranges.length) return [];
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const out: SqlFillTablePreviewSlice[] = [];

  for (let ri = 0; ri < ranges.length; ri++) {
    const range = ranges[ri];
    const availFirst = contentH - el.y;
    const maxRowsFirst = rowsFitInPx(availFirst, rowH);
    let dataCapFirst = Math.max(0, maxRowsFirst - 1);
    if (dataCapFirst === 0 && range.dataRowCount > 0) dataCapFirst = 1;

    let cursor = 0;
    let firstOfRecord = true;
    while (cursor < range.dataRowCount) {
      const maxRows = firstOfRecord ? maxRowsFirst : rowsFitInPx(contentH, rowH);
      const hdr = firstOfRecord || repeatHeader ? 1 : 0;
      let dataCap = Math.max(0, maxRows - (firstOfRecord ? 1 : hdr));
      if (firstOfRecord) dataCap = dataCapFirst;
      if (dataCap === 0) dataCap = 1;
      const take = Math.min(dataCap, range.dataRowCount - cursor);
      if (take <= 0) break;
      out.push({
        dataRowStart: range.dataRowStart + cursor,
        dataRowCount: take,
        includeHeaderRow: firstOfRecord || repeatHeader,
      });
      cursor += take;
      firstOfRecord = false;
    }
  }
  return out;
}

function hasWidgetsBelowSqlFillTable(
  els: TemplateElement[],
  table: TemplateElement,
  baselineY: number,
): boolean {
  return els.some(
    (e) =>
      e.id !== table.id &&
      tplElementsHorizontallyOverlap(e, table) &&
      e.y >= baselineY - 0.25,
  );
}

function slicesForBodyPage(
  tmpl: ReportTemplate,
  bodyPageIndex: number,
  previewValues: Record<string, BindingPreviewCell | undefined>,
): ExpandedBodyPreviewCard[] {
  const m = metricsForSheet(tmpl, "body");
  const contentH = m.contentH;
  const els = bodyElementsRef(tmpl, "body", bodyPageIndex);
  const overflowEl = pickSqlFillTableForPreviewPagination(els, contentH, previewValues);
  if (!overflowEl || overflowEl.type !== "table") {
    return [
      {
        bodyPageIndex,
        continuationIndex: 0,
        sqlFillTableSlices: {},
        continuationHideOtherBodyElements: false,
      },
    ];
  }
  const pk = templateTableSqlFillPreviewKey(overflowEl.id);
  const rows = previewValues[pk]?.tableSqlFill?.dataRows ?? [];
  const sqlN = rows.length;
  const fill = overflowEl.tableSqlFill!;
  const displayN = sqlFillDisplayDataRowCount(fill, sqlN);
  const repeatHeader = fill.repeatHeaderOnPageBreak !== false;
  const pagePerRecord =
    isVerticalSqlFill(fill) &&
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record";

  // 纵表另起一页：按 SQL 记录切卡；续表 / 横表：按逻辑行高切卡
  const chunks = pagePerRecord
    ? buildSlicesForVerticalPagePerRecord(overflowEl, sqlN, contentH, repeatHeader)
    : buildSlicesForOverflowTable(overflowEl, displayN, contentH, repeatHeader);

  // 另起一页：即使单条也能放下，多条时仍要拆成多卡
  if (chunks.length <= 1 && !(pagePerRecord && sqlN > 1)) {
    return [
      {
        bodyPageIndex,
        continuationIndex: 0,
        sqlFillTableSlices: {},
        continuationHideOtherBodyElements: false,
      },
    ];
  }

  // page_per_record 且每条都能放下时，chunks 可能已按记录拆好；若仍为 1 且 sqlN>1，强制按记录拆
  let finalChunks = chunks;
  if (pagePerRecord && sqlN > 1 && chunks.length <= 1) {
    const per = verticalSqlSlotsPerRecord(fill);
    finalChunks = [];
    for (let i = 0; i < sqlN; i++) {
      finalChunks.push({
        dataRowStart: i * per,
        dataRowCount: per,
        includeHeaderRow: true,
      });
    }
  }

  const logicalBottom = estimatedSqlFillTableBottomY(overflowEl, displayN);
  const hasBelow = hasWidgetsBelowSqlFillTable(els, overflowEl, logicalBottom);

  const cards: ExpandedBodyPreviewCard[] = finalChunks.map((slice, idx) => ({
    bodyPageIndex,
    continuationIndex: idx,
    sqlFillTableSlices: { [overflowEl.id]: slice },
    continuationHideOtherBodyElements: idx > 0,
    sqlFillHideBelow:
      idx === 0 ? { tableId: overflowEl.id, baselineY: logicalBottom } : undefined,
    showSqlFillTailDividerHint:
      hasBelow && idx === finalChunks.length - 1 ? true : undefined,
    overflowSqlFillTableId: overflowEl.id,
  }));

  if (hasBelow) {
    cards.push({
      bodyPageIndex,
      continuationIndex: finalChunks.length,
      sqlFillTableSlices: {},
      continuationHideOtherBodyElements: true,
      tailOnlyBelowBaseline: true,
      tailBaselineY: logicalBottom,
      overflowSqlFillTableId: overflowEl.id,
    });
  }

  return cards;
}

/**
 * 将各正文画布页展开为若干导出预览卡片（SQL 填充表过高时自动追加「续页」卡片）。
 */
export function computeExpandedBodyPreviewCards(
  tmpl: ReportTemplate,
  previewValues: Record<string, BindingPreviewCell | undefined> | null | undefined,
): ExpandedBodyPreviewCard[] {
  const vals = previewValues ?? {};
  const pages = ensureBodyPages(tmpl);
  const out: ExpandedBodyPreviewCard[] = [];
  for (let bp = 0; bp < pages.length; bp++) {
    out.push(...slicesForBodyPage(tmpl, bp, vals));
  }
  return out;
}
