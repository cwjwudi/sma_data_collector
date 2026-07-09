/**
 * 纵表：将 SQL 结果行转置为「左字段名 | 右字段值」逻辑行（含空白分隔行）。
 */

import type { TableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import {
  ensureVerticalFieldLabels,
  isVerticalSqlFill,
  isVerticalSqlSlotBoundField,
  isVerticalSqlSlotPending,
  normalizeTableSqlVerticalMultiRecordMode,
  verticalSlotLabel,
} from "@/lib/report-template/table-sql-fill";

/** 纵表「同表续表」模式下，多条 SQL 结果之间的组间分隔行文案（编辑画布可见） */
export const VERTICAL_SQL_CONTINUE_RECORD_SEP_LABEL = "— 续表分隔 —";

/** 纵表一条逻辑显示行（对应表格一行，固定两列） */
export interface VerticalSqlLogicalRow {
  /** 左列：字段标签；空白分隔行为空；组间续表分隔为 VERTICAL_SQL_CONTINUE_RECORD_SEP_LABEL */
  label: string;
  /** 右列：字段值；空白分隔行为空 */
  value: string;
  /** 是否为空白分隔行 */
  blank: boolean;
}

/** 单条 SQL 结果展开后的逻辑行数（不含组间分隔） */
export function verticalSqlSlotsPerRecord(fill: TableSqlFillConfig): number {
  if (!fill.visualSource) return 1;
  return Math.max(1, fill.visualSource.columns.length);
}

/**
 * 将预览 dataRows（按 SELECT 字段顺序，不含空白槽 / 待选槽）展开为纵表逻辑行。
 * visualSource.columns 中的空串表示「整行空白分隔」；待选占位行显示「（待选字段）」。
 * page_per_record 模式下组间不加空白（每条结果另起一页）。
 */
export function buildVerticalSqlLogicalRows(
  fill: TableSqlFillConfig,
  dataRows: string[][] | null | undefined,
): VerticalSqlLogicalRow[] {
  if (!isVerticalSqlFill(fill) || !fill.visualSource) return [];
  ensureVerticalFieldLabels(fill);
  const slots = fill.visualSource.columns;
  const rows = Array.isArray(dataRows) ? dataRows : [];
  const out: VerticalSqlLogicalRow[] = [];
  const pagePerRecord =
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record";

  for (let ri = 0; ri < rows.length; ri++) {
    const dr = rows[ri] || [];
    let fieldIdx = 0;
    for (let si = 0; si < slots.length; si++) {
      const field = String(slots[si] ?? "").trim();
      if (!field) {
        out.push({ label: "", value: "", blank: true });
        continue;
      }
      if (isVerticalSqlSlotPending(field)) {
        out.push({ label: "（待选字段）", value: "", blank: false });
        continue;
      }
      const label = verticalSlotLabel(fill, si);
      const value = fieldIdx < dr.length ? String(dr[fieldIdx] ?? "") : "";
      fieldIdx++;
      out.push({ label, value, blank: false });
    }
    // 续表模式：多条 SQL 结果之间插入带文案的组间分隔；另起一页模式不加（页边界即分隔）
    if (!pagePerRecord && ri < rows.length - 1 && slots.length > 0) {
      out.push({ label: VERTICAL_SQL_CONTINUE_RECORD_SEP_LABEL, value: "", blank: true });
    }
  }
  return out;
}

/** 纵表逻辑行数（用于分页 / 行高估算） */
export function verticalSqlLogicalRowCount(
  fill: TableSqlFillConfig,
  dataRowCount: number,
): number {
  if (!isVerticalSqlFill(fill) || !fill.visualSource) return 0;
  const n = Math.max(0, Math.floor(Number(dataRowCount)) || 0);
  if (n <= 0) return 0;
  const perRecord = verticalSqlSlotsPerRecord(fill);
  const pagePerRecord =
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record";
  if (pagePerRecord) return n * perRecord;
  // n 组记录 + (n-1) 组间分隔
  return n * perRecord + Math.max(0, n - 1);
}

/**
 * 另起一页模式：每条 SQL 结果对应的逻辑行区间 [start, start+count)。
 * 返回与 dataRows 下标对齐的切片列表。
 */
export function verticalSqlRecordLogicalRanges(
  fill: TableSqlFillConfig,
  sqlDataRowCount: number,
): Array<{ dataRowStart: number; dataRowCount: number }> {
  const n = Math.max(0, Math.floor(Number(sqlDataRowCount)) || 0);
  if (n <= 0) return [];
  const per = verticalSqlSlotsPerRecord(fill);
  const out: Array<{ dataRowStart: number; dataRowCount: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ dataRowStart: i * per, dataRowCount: per });
  }
  return out;
}

/** SQL 结果列数（仅已绑定 field 槽，与 dataRows[i].length 对齐） */
export function verticalSqlSelectColCount(fill: TableSqlFillConfig): number {
  if (!fill.visualSource) return 0;
  return fill.visualSource.columns.filter((c) => isVerticalSqlSlotBoundField(c)).length;
}
