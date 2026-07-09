/**
 * 纵表：将 SQL 结果行转置为「左字段名 | 右字段值」逻辑行（含空白分隔行）。
 */

import type { TableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import {
  ensureVerticalFieldLabels,
  isVerticalSqlFill,
  verticalSlotLabel,
} from "@/lib/report-template/table-sql-fill";

/** 纵表一条逻辑显示行（对应表格一行，固定两列） */
export interface VerticalSqlLogicalRow {
  /** 左列：字段标签；空白分隔行为空 */
  label: string;
  /** 右列：字段值；空白分隔行为空 */
  value: string;
  /** 是否为空白分隔行 */
  blank: boolean;
}

/**
 * 将预览 dataRows（按 SELECT 字段顺序，不含空白槽）展开为纵表逻辑行。
 * visualSource.columns 中的空串表示「整行空白分隔」。
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

  for (let ri = 0; ri < rows.length; ri++) {
    const dr = rows[ri] || [];
    let fieldIdx = 0;
    for (let si = 0; si < slots.length; si++) {
      const field = String(slots[si] ?? "").trim();
      if (!field) {
        out.push({ label: "", value: "", blank: true });
        continue;
      }
      const label = verticalSlotLabel(fill, si);
      const value = fieldIdx < dr.length ? String(dr[fieldIdx] ?? "") : "";
      fieldIdx++;
      out.push({ label, value, blank: false });
    }
    // 多条 SQL 结果之间插入一条空白分隔（最后一组后不加）
    if (ri < rows.length - 1 && slots.length > 0) {
      out.push({ label: "", value: "", blank: true });
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
  const slots = fill.visualSource.columns;
  const perRecord = Math.max(1, slots.length);
  // n 组记录 + (n-1) 组间分隔
  return n * perRecord + Math.max(0, n - 1);
}

/** SQL 结果列数（仅 field 槽，与 dataRows[i].length 对齐） */
export function verticalSqlSelectColCount(fill: TableSqlFillConfig): number {
  if (!fill.visualSource) return 0;
  return fill.visualSource.columns.filter((c) => String(c ?? "").trim()).length;
}
