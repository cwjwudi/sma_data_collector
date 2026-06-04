/**
 * 将「可视化数据源」编译为 querySql + params（占位符 {{p0}}…），供导出生成器消费。
 * 仅允许 [a-zA-Z0-9_] 标识符；MongoDB 不走 SQL 可视化路径。
 */

import type {
  TableSqlFillConfig,
  TableSqlParamBinding,
  VisualSqlFilter,
  VisualSqlFilterKind,
} from "@/lib/report-template/table-sql-fill";
import {
  clampSqlFillParamColumnRefs,
  defaultSqlParam,
  ensureMinTableSqlParamSlots,
  ensureTableSqlResultColumnNames,
  ensureVisualOutputColumnSlots,
  ensureVisualSource,
  validateSqlIdentifier,
} from "@/lib/report-template/table-sql-fill";

export function quoteSqlIdentifier(engineLower: string, name: string): string {
  validateSqlIdentifier(name);
  if (engineLower === "postgres" || engineLower === "sqlite") return `"${name.replace(/"/g, '""')}"`;
  return `\`${name.replace(/`/g, "")}\``;
}

/** 第 fi 条筛选条件在扁平 params 中的起始下标（与 compileVisualTableSql 一致） */
export function visualFilterParamSlotBase(filters: VisualSqlFilter[], filterIndex: number): number {
  let off = 0;
  const upto = Math.max(0, Math.min(filterIndex, filters.length));
  for (let i = 0; i < upto; i++) {
    off += filters[i].kind === "equality" ? 1 : 2;
  }
  return off;
}

export function buildDistinctSelectSql(engineLower: string, table: string, column: string, limit: number): string {
  validateSqlIdentifier(table);
  validateSqlIdentifier(column);
  const lim = Math.min(200, Math.max(1, Math.round(limit)));
  const qt = quoteSqlIdentifier(engineLower, table.trim());
  const qc = quoteSqlIdentifier(engineLower, column.trim());
  return `SELECT DISTINCT ${qc} AS __dv FROM ${qt} WHERE ${qc} IS NOT NULL LIMIT ${lim}`;
}

function bindingSlotsForKind(kind: VisualSqlFilterKind): number {
  return kind === "equality" ? 1 : 2;
}

/** 编译成功返回 true；配置不完整时清空 querySql 并返回 false */
export function compileVisualTableSql(fill: TableSqlFillConfig): boolean {
  if (!fill.enabled || fill.fillMode !== "visual") return false;
  const vs = fill.visualSource;
  if (!vs?.connectionId?.trim() || !vs.table?.trim()) {
    fill.querySql = "";
    return false;
  }
  const eng = (vs.engine || "mysql").toLowerCase();
  if (eng === "mongodb") {
    fill.querySql = "";
    return false;
  }

  const hasAnyOutput = vs.columns.some((c) => String(c ?? "").trim());
  if (!hasAnyOutput) {
    fill.querySql = "";
    return false;
  }

  try {
    validateSqlIdentifier(vs.table.trim());
    for (const c of vs.columns) {
      const t = String(c ?? "").trim();
      if (t) validateSqlIdentifier(t);
    }
  } catch {
    fill.querySql = "";
    return false;
  }

  const qcols = vs.columns
    .map((c) => {
      const t = String(c ?? "").trim();
      if (!t) return "NULL";
      return quoteSqlIdentifier(eng, t);
    })
    .join(", ");
  const qtbl = quoteSqlIdentifier(eng, vs.table.trim());

  const whereParts: string[] = [];
  const flatParams: TableSqlParamBinding[] = [];
  let pi = 0;

  for (const f of fill.visualFilters || []) {
    if (!f.column?.trim()) continue;
    try {
      validateSqlIdentifier(f.column.trim());
    } catch {
      continue;
    }
    const qc = quoteSqlIdentifier(eng, f.column.trim());
    const slots = bindingSlotsForKind(f.kind);
    while (f.defaults.length < slots) f.defaults.push("");
    f.defaults.length = slots;
    while (f.bindings.length < slots) f.bindings.push(defaultSqlParam());
    f.bindings.length = slots;

    if (f.kind === "equality") {
      whereParts.push(`${qc} = {{p${pi}}}`);
      const b = { ...f.bindings[0] };
      b.literalFallback = String(f.defaults[0] ?? "").trim();
      if (b.source === "literal") b.opcuaNodeId = "";
      flatParams.push(b);
      pi++;
      continue;
    }

    if (f.kind === "datetime_between" || f.kind === "date_between" || f.kind === "numeric_between") {
      whereParts.push(`${qc} >= {{p${pi}}} AND ${qc} <= {{p${pi + 1}}}`);
      const b0 = { ...f.bindings[0] };
      b0.literalFallback = String(f.defaults[0] ?? "").trim();
      if (b0.source === "literal") b0.opcuaNodeId = "";
      const b1 = { ...f.bindings[1] };
      b1.literalFallback = String(f.defaults[1] ?? "").trim();
      if (b1.source === "literal") b1.opcuaNodeId = "";
      flatParams.push(b0, b1);
      pi += 2;
    }
  }

  const whereSql = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
  fill.querySql = `SELECT ${qcols} FROM ${qtbl}${whereSql}`;
  fill.params = flatParams;
  ensureMinTableSqlParamSlots(fill, Math.max(2, flatParams.length));
  return true;
}

/** 根据 visualSource.columns 重新编译 SQL，并同步 resultColumnNames / 参数列引用 */
export function syncVisualFillQueryAndResultNames(fill: TableSqlFillConfig, colCount: number): void {
  if (!fill.enabled || fill.fillMode !== "visual") return;
  ensureVisualSource(fill);
  ensureVisualOutputColumnSlots(fill, colCount);
  compileVisualTableSql(fill);
  ensureTableSqlResultColumnNames(fill, colCount);
  const n = Math.max(1, Math.min(30, Math.floor(Number(colCount)) || 1));
  const vc = fill.visualSource!.columns;
  for (let i = 0; i < n; i++) {
    if (!String(fill.resultColumnNames[i] ?? "").trim()) {
      fill.resultColumnNames[i] = vc[i] ?? "";
    }
  }
  clampSqlFillParamColumnRefs(fill, colCount);
}

/** 画布第一行下拉写入某一列的输出字段名 */
export function applyVisualSqlOutputColumnPick(
  fill: TableSqlFillConfig,
  colCount: number,
  columnIndex: number,
  fieldName: string,
  gridHeaderCell?: { text?: string },
): void {
  ensureVisualSource(fill);
  ensureVisualOutputColumnSlots(fill, colCount);
  ensureTableSqlResultColumnNames(fill, colCount);
  const prevFieldName = String(fill.visualSource!.columns[columnIndex] ?? "").trim();
  const prevHeaderName = String(fill.resultColumnNames[columnIndex] ?? "").trim();
  fill.visualSource!.columns[columnIndex] = fieldName;
  if (!prevHeaderName || prevHeaderName === prevFieldName) {
    fill.resultColumnNames[columnIndex] = fieldName;
  }
  if (gridHeaderCell && typeof gridHeaderCell.text === "string") gridHeaderCell.text = fieldName;
  syncVisualFillQueryAndResultNames(fill, colCount);
}
