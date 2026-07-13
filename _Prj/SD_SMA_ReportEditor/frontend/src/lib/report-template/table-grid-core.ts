/**
 * 表格网格模型「共享核心」：正文表（model.ts TemplateElement）与版式区表
 * （layout-zone-element.ts LayoutZoneElement）的单元格网格结构、列宽、chrome、内侧列宽
 * 曾各存一份近乎逐字复制的实现（易漂移）。此处抽出行为一致的原语，两侧委托复用。
 *
 * 说明：两种表格元素的单元格结构完全一致，差异仅在节点 padding 常量（正文 4/4，版式 2/4）
 * 与单元格 hydrate 的类型标注。故网格原语按元素结构接口 + 泛型单元格 + padding 参数共享；
 * 而 intrinsicOuterHeight / clamp 外框尺寸因 SQL 填充高度语义存在历史差异（漂移），暂保留各自实现。
 */

import {
  distributeTableColumnInnerWidthsPx,
  type EdgePaddingPx,
  TEMPLATE_TABLE_MAX_COLS,
  TEMPLATE_TABLE_MAX_ROWS,
  uniformTableCellBoxPx,
} from "@/lib/report-template/table-cell-metrics";
import type { TableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import {
  clampSqlFillParamColumnRefs,
  ensureTableSqlResultColumnNames,
  ensureTwoTableSqlParamSlots,
  ensureVisualOutputColumnSlots,
} from "@/lib/report-template/table-sql-fill";

/** 表格元素在网格原语层需要的最小结构（TemplateElement / LayoutZoneElement 均满足） */
export interface TableGridElementLike {
  type?: string;
  tableRows?: number;
  tableCols?: number;
  // 单元格类型由各侧决定，核心只做重塑；用 any[][] 避免可写属性型变冲突
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tableCells?: any[][];
  tableColWidthsPx?: number[];
  tableColBgColors?: string[];
  tableSqlFill?: TableSqlFillConfig | null;
  w: number;
  h: number;
}

export function clampTableRowsDim(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TEMPLATE_TABLE_MAX_ROWS, Math.max(1, n));
}

export function clampTableColsDim(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TEMPLATE_TABLE_MAX_COLS, Math.max(1, n));
}

/** 维持 tableColWidthsPx 与 tableCols 同长度；新增列默认权重 0（表示均分） */
export function ensureTableColWidthsPxCore(el: TableGridElementLike): void {
  if (el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  if (!Array.isArray(el.tableColWidthsPx)) el.tableColWidthsPx = [];
  const arr = el.tableColWidthsPx;
  while (arr.length < cols) arr.push(0);
  arr.length = cols;
}

/** 维持 tableColBgColors 与 tableCols 同长度，非法项回落 transparent */
export function ensureTableColBgColors(el: {
  type?: string;
  tableCols?: number;
  tableColBgColors?: string[];
}): void {
  if (el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  if (!Array.isArray(el.tableColBgColors)) {
    el.tableColBgColors = Array.from({ length: cols }, () => "transparent");
    return;
  }
  const arr = el.tableColBgColors;
  while (arr.length < cols) arr.push("transparent");
  if (arr.length > cols) arr.length = cols;
  for (let i = 0; i < cols; i++) {
    if (typeof arr[i] !== "string") arr[i] = "transparent";
  }
}

/** 表格外框纵向 chrome（节点 padding + 表壳底 1px）；padding 因正文/版式而异 */
export function tableVerticalChromePxFor(nodePadding: EdgePaddingPx): number {
  const shellBottomPadPx = 1;
  return nodePadding.top + nodePadding.bottom + shellBottomPadPx;
}

/**
 * 按 tableRows/tableCols 重塑 tableCells，就地写回 el。
 * hydrateCell 由各侧提供（单元格类型不同但结构一致）。
 */
export function ensureTableGridCore<Cell>(
  el: TableGridElementLike,
  hydrateCell: (raw: unknown) => Cell,
): Cell[][] {
  if (el.type !== "table") return [];
  const rows = clampTableRowsDim(el.tableRows, 3);
  const cols = clampTableColsDim(el.tableCols, 4);
  el.tableRows = rows;
  el.tableCols = cols;
  const prev: Cell[][] = Array.isArray(el.tableCells) ? (el.tableCells as Cell[][]) : [];
  if (prev.length === rows && prev.every((row) => Array.isArray(row) && row.length === cols)) {
    ensureTableColWidthsPxCore(el);
    ensureTableColBgColors(el);
  } else {
    const grid: Cell[][] = [];
    for (let r = 0; r < rows; r++) {
      const pr: Cell[] = Array.isArray(prev[r]) ? prev[r] : [];
      const row: Cell[] = [];
      for (let c = 0; c < cols; c++) row.push(hydrateCell(pr[c]));
      grid.push(row);
    }
    el.tableCells = grid;
    ensureTableColWidthsPxCore(el);
    ensureTableColBgColors(el);
  }
  if (el.tableSqlFill) {
    ensureTwoTableSqlParamSlots(el.tableSqlFill);
    ensureTableSqlResultColumnNames(el.tableSqlFill, cols);
    if (el.tableSqlFill.visualSource) ensureVisualOutputColumnSlots(el.tableSqlFill, cols);
    clampSqlFillParamColumnRefs(el.tableSqlFill, cols);
  }
  return el.tableCells as Cell[][];
}

/**
 * 表格内侧各列像素宽（与画布 colgroup 一致）；**只读**，绝不写回 el，
 * 供 Vue computed / 渲染期安全调用。用列数/行数钳制值与 tableColWidthsPx 的补齐副本重算，
 * 网格已一致时与「先 ensure 再量」结果相同，但不 ensure、不 mutate。
 */
export function tableColumnInnerWidthsPxReadonly(
  el: TableGridElementLike,
  nodePadding: EdgePaddingPx,
): number[] {
  if (el.type !== "table") return [];
  const cols = clampTableColsDim(el.tableCols, 4);
  const rows = clampTableRowsDim(el.tableRows, 3);
  const widths = Array.isArray(el.tableColWidthsPx) ? el.tableColWidthsPx.slice(0, cols) : [];
  while (widths.length < cols) widths.push(0);
  const u = uniformTableCellBoxPx({
    outerW: el.w,
    outerH: el.h,
    rowCount: rows,
    colCount: cols,
    nodePadding,
  });
  return distributeTableColumnInnerWidthsPx(u.innerW, cols, widths);
}
