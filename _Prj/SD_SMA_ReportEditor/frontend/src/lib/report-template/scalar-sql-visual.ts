/** 数据参数 / 单元格标量 SQL 的可视化查询配置（编译进 sqlText） */

export type ScalarSqlFillMode = "manual" | "visual";

export interface ScalarSqlVisualConfig {
  connectionId: string;
  database: string;
  table: string;
  engine: string;
  /** SELECT 的列（首行首列作为显示值） */
  valueColumn: string;
  /** WHERE 列；空表示无筛选 */
  whereColumn: string;
  /** 使用 {{p0}} 或 {{p1}} */
  whereParamSlot: number;
}

export function defaultScalarSqlVisual(): ScalarSqlVisualConfig {
  return {
    connectionId: "",
    database: "",
    table: "",
    engine: "",
    valueColumn: "",
    whereColumn: "",
    whereParamSlot: 0,
  };
}

export function hydrateScalarSqlVisual(raw: unknown): ScalarSqlVisualConfig {
  const d = defaultScalarSqlVisual();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const slot = Math.floor(Number(o.whereParamSlot));
  return {
    connectionId: typeof o.connectionId === "string" ? o.connectionId : d.connectionId,
    database: typeof o.database === "string" ? o.database : d.database,
    table: typeof o.table === "string" ? o.table : d.table,
    engine: typeof o.engine === "string" ? o.engine : d.engine,
    valueColumn: typeof o.valueColumn === "string" ? o.valueColumn : d.valueColumn,
    whereColumn: typeof o.whereColumn === "string" ? o.whereColumn : d.whereColumn,
    whereParamSlot: slot === 1 ? 1 : 0,
  };
}

export function normalizeScalarSqlFillMode(v: unknown, sqlText: string): ScalarSqlFillMode {
  if (v === "visual" || v === "manual") return v;
  return sqlText.trim() ? "manual" : "visual";
}
