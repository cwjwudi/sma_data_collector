/**
 * 导出预览栈：数据库整表填充超出正文区高度时，按页拆分多张预览卡片（模拟分页）。
 */

import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import { cellKey, resolveStaticTableCellLayoutText } from "@/lib/report-template/binding-preview-utils";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages, ensureTableGrid, templateTableColumnInnerWidthsPx } from "@/lib/report-template/model";
import { clampTableRowHeightPx, takeLogicalRowLinesForAvail } from "@/lib/report-template/table-cell-metrics";
import {
  estimatedSqlFillTableBottomY,
  computeSqlFillLogicalRowHeightsPx,
  tableSqlFillVerticalChromePx,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import {
  buildLogicalRowSlicesForOverflow,
  computeTemplateTableContentRowHeightsPx,
  makeStaticTableSplitRow,
  outerHeightFromTableRowHeightsPx,
  templateTableExceedsPageRemaining,
  type SplitRowForAvail,
} from "@/lib/report-template/table-content-layout";
import type { TablePreviewRowSlice } from "@/lib/report-template/table-preview-row-slice";
import {
  formatSqlFillTableCellPreview,
  sqlFillDisplayDataRowCount,
  templateTableSqlFillPreviewKey,
} from "@/lib/report-template/table-sql-fill-preview";
import {
  isVerticalSqlFill,
  normalizeTableSqlVerticalMultiRecordMode,
} from "@/lib/report-template/table-sql-fill";
import { verticalSqlRecordLogicalRanges, verticalSqlSlotsPerRecord } from "@/lib/report-template/table-sql-vertical";
import type { TableSqlFillPreviewPayload } from "@/lib/report-template/binding-preview-utils";

/** 迷你预览中单张卡片内的表格片段（含行内跨页视觉行区间） */
export type SqlFillTablePreviewSlice = TablePreviewRowSlice;

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

/** 按可变行高累计，返回在 availPx 内能放下的整行数（装不下返回 0） */
function rowsFitWithHeights(availPx: number, heights: number[], fallbackRowH: number): number {
  const usable = Math.max(0, availPx - tableSqlFillVerticalChromePx());
  if (!heights.length) {
    return Math.max(0, Math.floor(usable / Math.max(1, fallbackRowH)));
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

function makeSqlFillDataRowSplit(
  el: TemplateElement,
  preview: TableSqlFillPreviewPayload | null | undefined,
): SplitRowForAvail {
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
  const fill = el.tableSqlFill!;
  return (dataRowIndex, availInnerPx, lineStart) => {
    // 本地 ri：无 slice 时 format 用 ri=0 表头、ri>=1 数据 → 取数据行用 ri = dataRowIndex+1
    const cellTexts = colWidths.map((_, ci) =>
      formatSqlFillTableCellPreview({
        fill,
        rowIndex: dataRowIndex + 1,
        colIndex: ci,
        preview: preview ?? null,
        previewLoading: false,
        errorMaxLen: 500,
      }),
    );
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

/** 首屏正文区从表格顶部起，能否容纳「1 行表头 + 全部数据行」（导出预览分页判定） */
export function sqlFillTableNeedsPreviewPagination(
  el: TemplateElement,
  dataRowCount: number,
  contentH: number,
  sqlDataRowCount?: number,
  rowHeightsPx?: number[] | null,
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
  const heights = rowHeightsPx?.length ? rowHeightsPx : Array.from({ length: 1 + dataRowCount }, () => rowH);
  const capFirst = rowsFitWithHeights(contentH - el.y, heights, rowH);
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
    const heights = computeSqlFillLogicalRowHeightsPx(el, pv, displayN, null, { uncapped: true });
    if (!sqlFillTableNeedsPreviewPagination(el, displayN, contentH, sqlN, heights)) continue;
    const bottom = estimatedSqlFillTableBottomY(el, displayN, heights);
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
  allRowHeights: number[],
  splitDataRow?: SplitRowForAvail,
): SqlFillTablePreviewSlice[] {
  if (el.type !== "table" || dataRowCount <= 0) return [];
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const chrome = tableSqlFillVerticalChromePx();
  const slices: SqlFillTablePreviewSlice[] = [];
  // allRowHeights: [header, data0, data1, ...]
  const headerH = allRowHeights[0] ?? rowH;
  const dataHeights = allRowHeights.slice(1);

  let cursor = 0;
  let lineStart = 0;
  let first = true;
  let guard = 0;
  const maxGuard = Math.max(64, dataRowCount * 64);

  while (cursor < dataRowCount && guard++ < maxGuard) {
    const availOuter = first ? contentH - el.y : contentH;
    const usable = Math.max(0, availOuter - chrome);
    const includeHeader = first || repeatHeader;
    const headerCost = includeHeader ? headerH : 0;
    const availForData = usable - headerCost;

    if (availForData <= 0) {
      if (first) {
        first = false;
        continue;
      }
      // 整页却放不下表头：退化只推数据（极少见）
      slices.push({
        dataRowStart: cursor,
        dataRowCount: 1,
        includeHeaderRow: false,
      });
      cursor += 1;
      lineStart = 0;
      first = false;
      continue;
    }

    if (lineStart > 0 && splitDataRow) {
      const frag = splitDataRow(cursor, availForData, lineStart);
      if (!frag || frag.lineEnd <= lineStart) {
        first = false;
        continue;
      }
      slices.push({
        dataRowStart: cursor,
        dataRowCount: 1,
        includeHeaderRow: includeHeader,
        rowTextLineStart: lineStart,
        rowTextLineEnd: frag.lineEnd,
        rowFragment: true,
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

    const rest = dataHeights.slice(cursor);
    let used = 0;
    let take = 0;
    for (const h of rest) {
      const hh = Math.max(1, h);
      if (used + hh > availForData) break;
      used += hh;
      take += 1;
    }

    if (take > 0) {
      slices.push({
        dataRowStart: cursor,
        dataRowCount: take,
        includeHeaderRow: includeHeader,
      });
      cursor += take;
      lineStart = 0;
      first = false;
      continue;
    }

    // 当前数据行整行放不下
    const rowHgt = Math.max(1, dataHeights[cursor] ?? rowH);
    if (splitDataRow && rowHgt > availForData) {
      const frag = splitDataRow(cursor, availForData, 0);
      if (frag && frag.lineEnd > 0) {
        const isFrag = frag.lineEnd < frag.totalLines;
        slices.push({
          dataRowStart: cursor,
          dataRowCount: 1,
          includeHeaderRow: includeHeader,
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

    if (first) {
      first = false;
      continue;
    }

    slices.push({
      dataRowStart: cursor,
      dataRowCount: 1,
      includeHeaderRow: includeHeader,
    });
    cursor += 1;
    lineStart = 0;
    first = false;
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
  preview: BindingPreviewCell["tableSqlFill"] | null | undefined,
): SqlFillTablePreviewSlice[] {
  if (el.type !== "table" || !el.tableSqlFill || sqlDataRowCount <= 0) return [];
  const fill = el.tableSqlFill;
  const ranges = verticalSqlRecordLogicalRanges(fill, sqlDataRowCount);
  if (!ranges.length) return [];
  const displayN = sqlFillDisplayDataRowCount(fill, sqlDataRowCount);
  const allHeights = computeSqlFillLogicalRowHeightsPx(el, preview, displayN, null, { uncapped: true });
  const splitDataRow = makeSqlFillDataRowSplit(el, preview);
  const out: SqlFillTablePreviewSlice[] = [];

  for (const range of ranges) {
    // 将单条记录的逻辑行当作一张「子表」做 overflow 切片，再把 dataRowStart 平移到全局
    const subHeights = [
      allHeights[0] ?? clampTableRowHeightPx(el.tableRowHeightPx),
      ...allHeights.slice(range.dataRowStart + 1, range.dataRowStart + 1 + range.dataRowCount),
    ];
    const sub = buildSlicesForOverflowTable(
      el,
      range.dataRowCount,
      contentH,
      repeatHeader,
      subHeights,
      (localDataIdx, avail, lineStart) => splitDataRow(range.dataRowStart + localDataIdx, avail, lineStart),
    );
    for (const s of sub) {
      out.push({
        ...s,
        dataRowStart: range.dataRowStart + s.dataRowStart,
      });
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

function staticTableRowHeightsForPreview(
  el: TemplateElement,
  previewValues: Record<string, BindingPreviewCell | undefined>,
  uncapped = false,
): number[] {
  ensureTableGrid(el);
  const grid = el.tableCells || [];
  return computeTemplateTableContentRowHeightsPx(
    el,
    (ri, ci) => {
      const cell = grid[ri]?.[ci];
      return resolveStaticTableCellLayoutText({
        cell,
        previewCell: previewValues[cellKey(el.id, ri, ci)],
        loading: false,
      });
    },
    { uncapped },
  );
}

function pickStaticTableForPreviewPagination(
  els: TemplateElement[],
  contentH: number,
  previewValues: Record<string, BindingPreviewCell | undefined>,
): { el: TemplateElement; heights: number[] } | null {
  let best: { el: TemplateElement; heights: number[] } | null = null;
  let bestBottom = -Infinity;
  for (const el of els) {
    if (el.type !== "table" || el.tableSqlFill?.enabled) continue;
    const heights = staticTableRowHeightsForPreview(el, previewValues, true);
    if (!templateTableExceedsPageRemaining(el, contentH, heights)) continue;
    const bottom = el.y + outerHeightFromTableRowHeightsPx(heights, el.tableRowHeightPx);
    if (bottom >= bestBottom) {
      bestBottom = bottom;
      best = { el, heights };
    }
  }
  return best;
}

function cardsForStaticTableOverflow(
  els: TemplateElement[],
  bodyPageIndex: number,
  contentH: number,
  overflowEl: TemplateElement,
  allHeights: number[],
  previewValues: Record<string, BindingPreviewCell | undefined>,
): ExpandedBodyPreviewCard[] {
  const rowH = clampTableRowHeightPx(overflowEl.tableRowHeightPx);
  const grid = overflowEl.tableCells || [];
  const splitRow = makeStaticTableSplitRow(overflowEl, (ri, ci) => {
    const cell = grid[ri]?.[ci];
    return resolveStaticTableCellLayoutText({
      cell,
      previewCell: previewValues[cellKey(overflowEl.id, ri, ci)],
      loading: false,
    });
  });
  const chunks = buildLogicalRowSlicesForOverflow({
    rowHeights: allHeights,
    firstPageAvailOuterPx: contentH - overflowEl.y,
    nextPageAvailOuterPx: contentH,
    fallbackRowH: rowH,
    splitRow,
  });
  // 单卡但含行内片段时仍需展开（极少：整表一行且一页装下则 length=1 无 fragment）
  if (chunks.length <= 1 && !chunks[0]?.rowFragment) {
    return [
      {
        bodyPageIndex,
        continuationIndex: 0,
        sqlFillTableSlices: {},
        continuationHideOtherBodyElements: false,
      },
    ];
  }
  const logicalBottom = overflowEl.y + outerHeightFromTableRowHeightsPx(allHeights, rowH);
  const hasBelow = hasWidgetsBelowSqlFillTable(els, overflowEl, logicalBottom);
  const cards: ExpandedBodyPreviewCard[] = chunks.map((slice, idx) => ({
    bodyPageIndex,
    continuationIndex: idx,
    sqlFillTableSlices: { [overflowEl.id]: slice },
    continuationHideOtherBodyElements: idx > 0,
    sqlFillHideBelow:
      idx === 0 ? { tableId: overflowEl.id, baselineY: logicalBottom } : undefined,
    showSqlFillTailDividerHint:
      hasBelow && idx === chunks.length - 1 ? true : undefined,
    overflowSqlFillTableId: overflowEl.id,
  }));
  if (hasBelow) {
    cards.push({
      bodyPageIndex,
      continuationIndex: chunks.length,
      sqlFillTableSlices: {},
      continuationHideOtherBodyElements: true,
      tailOnlyBelowBaseline: true,
      tailBaselineY: logicalBottom,
      overflowSqlFillTableId: overflowEl.id,
    });
  }
  return cards;
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
    const staticHit = pickStaticTableForPreviewPagination(els, contentH, previewValues);
    if (staticHit) {
      return cardsForStaticTableOverflow(
        els,
        bodyPageIndex,
        contentH,
        staticHit.el,
        staticHit.heights,
        previewValues,
      );
    }
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
  const fillPv = previewValues[pk]?.tableSqlFill;
  const rows = fillPv?.dataRows ?? [];
  const sqlN = rows.length;
  const fill = overflowEl.tableSqlFill!;
  const displayN = sqlFillDisplayDataRowCount(fill, sqlN);
  const repeatHeader = fill.repeatHeaderOnPageBreak !== false;
  const pagePerRecord =
    isVerticalSqlFill(fill) &&
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record";
  const allHeights = computeSqlFillLogicalRowHeightsPx(overflowEl, fillPv, displayN, null, {
    uncapped: true,
  });
  const splitDataRow = makeSqlFillDataRowSplit(overflowEl, fillPv);

  // 纵表另起一页：按 SQL 记录切卡；续表 / 横表：按逻辑行高切卡
  const chunks = pagePerRecord
    ? buildSlicesForVerticalPagePerRecord(overflowEl, sqlN, contentH, repeatHeader, fillPv)
    : buildSlicesForOverflowTable(
        overflowEl,
        displayN,
        contentH,
        repeatHeader,
        allHeights,
        splitDataRow,
      );

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

  const logicalBottom = estimatedSqlFillTableBottomY(overflowEl, displayN, allHeights);
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
