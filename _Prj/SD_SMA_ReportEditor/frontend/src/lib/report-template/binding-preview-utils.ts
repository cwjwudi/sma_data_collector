import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages, ensureTableGrid } from "@/lib/report-template/model";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import {
  ensureZoneTableGrid,
  normalizeDecimalPlaces,
  normalizeNullDisplayMode,
  type NullDisplayMode,
} from "@/lib/report-template/layout-zone-element";
import { bodyElementsRef, type EditorSheet } from "@/lib/report-template/editor-sheet";
import type { TableSqlParamBinding, TableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import {
  ensureTableSqlResultColumnNames,
  ensureVerticalFieldLabels,
  tblfillHdrKey,
  tblfillSepKey,
  tblfillVlabelKey,
} from "@/lib/report-template/table-sql-fill";
import { hydrateScalarSqlVisual, normalizeScalarSqlFillMode, type ScalarSqlVisualConfig } from "@/lib/report-template/scalar-sql-visual";
import { compileScalarVisualSql } from "@/lib/report-template/scalar-sql-visual-compile";
import type { AutoBatchOpcBinding } from "@/lib/auto-batch-opc-binding";
import { hydrateMongoQuery, type MongoQueryConfig } from "@/lib/report-template/mongo-query";

/** 表格「整表 SQL 填充」在编辑器中的查询预览（非持久化字段） */
export interface TableSqlFillPreviewPayload {
  dataRows: string[][];
  error?: string;
  /** 取数失败/成功时的诊断信息（供导出失败审计） */
  diagnostics?: TableSqlFillDiagnostics;
}

/** 表格填充运行时诊断（导出失败写入审计，便于对照预览） */
export interface TableSqlFillDiagnostics {
  connectionId?: string;
  database?: string;
  /** 最终用于 SQL 的表名（OPC 值或结构参考表兜底） */
  resolvedTable?: string;
  tableOpcNodeId?: string;
  /** OPC 原始读数（未 sanitize） */
  tableOpcRawValue?: string;
  usedFallbackTable?: boolean;
  fallbackTable?: string;
  tableOpcReadError?: string;
  /** 实际下发的 SQL（截断） */
  sqlExecuted?: string;
  /** 缺表/OPC 瞬时失败时的重试次数（含首次） */
  retryAttempts?: number;
  /** 重试过程中读到的表名序列（便于对照 PLC 是否滞后） */
  retriedTables?: string[];
}

export type { NullDisplayMode };
export { normalizeNullDisplayMode, normalizeDecimalPlaces };

export function zoneParamKey(elId: string): string {
  return `zone-param:${elId}`;
}

export function zoneCellKey(elId: string, row: number, col: number): string {
  return `zone-cell:${elId}:${row}:${col}`;
}

/** 绑定读数是否视为空（null / 空串 / 历史 OPC 字面量 null） */
export function isBoundValueEmpty(text: string | null | undefined): boolean {
  if (text === null || text === undefined) return true;
  const t = text.trim();
  return t === "" || t === "null" || t === "undefined";
}

/** 预览/导出中的 OPC/SQL 错误文案，不走空值显示模式 */
export function isBindingPreviewErrorText(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("（OPC）") ||
    t.startsWith("（SQL）") ||
    t.startsWith("（Mongo）") ||
    t.startsWith("(OPC)") ||
    t.startsWith("(SQL)") ||
    t.startsWith("(Mongo)")
  );
}

export function resolveParameterDisplayText(opts: {
  boundText: string | null | undefined;
  hasBoundResult: boolean;
  mode: NullDisplayMode;
  fallbackText: string;
}): string {
  const { boundText, hasBoundResult, mode, fallbackText } = opts;
  if (!hasBoundResult) return "";
  const text = boundText ?? "";
  if (isBindingPreviewErrorText(text)) return text;
  if (!isBoundValueEmpty(text)) return text;
  switch (mode) {
    case "emptyLabel":
      return "空值";
    case "fallbackText":
      return fallbackText.trim();
    default:
      return "";
  }
}

export function resolveBoundParameterPreviewText(opts: {
  bindingKind: "none" | "opcua" | "sql" | "mongo";
  text: string;
  nullDisplayMode?: NullDisplayMode;
  decimalPlaces?: number | null;
  previewCell: BindingPreviewCell | undefined;
  loading: boolean;
  unboundHint?: string;
}): string {
  const { bindingKind, text, nullDisplayMode, decimalPlaces, previewCell, loading, unboundHint } = opts;
  if (bindingKind === "opcua" || bindingKind === "sql" || bindingKind === "mongo") {
    if (previewCell != null) {
      const resolved = resolveParameterDisplayText({
        boundText: previewCell.text,
        hasBoundResult: true,
        mode: normalizeNullDisplayMode(nullDisplayMode),
        fallbackText: text,
      });
      return applyDecimalPlacesToDisplayText(resolved, decimalPlaces);
    }
    if (loading) {
      return `${text.trim() || "参数"}（加载中…）`;
    }
    return unboundHint ?? (text.trim() || "（绑定预览：请确认 OPC / SQL / Mongo 已配置）");
  }
  const t = text.trim();
  return t;
}

/**
 * 对已解析的显示文案应用小数位（仅当文本可解析为有限数字时）。
 * 空值文案、错误文案、日期时间串等保持原样。
 */
export function applyDecimalPlacesToDisplayText(
  text: string,
  decimalPlaces?: number | null,
): string {
  const places = normalizeDecimalPlaces(decimalPlaces);
  if (places === undefined) return text;
  if (isBoundValueEmpty(text) || isBindingPreviewErrorText(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text.trim())) return text;
  const n = Number(String(text).trim().replace(/,/g, ""));
  if (!Number.isFinite(n)) return text;
  return n.toFixed(places);
}

export interface BindingPreviewCell {
  text: string;
  tableSqlFill?: TableSqlFillPreviewPayload;
}

export function paramKey(elId: string): string {
  return `param:${elId}`;
}

export function cellKey(elId: string, row: number, col: number): string {
  return `cell:${elId}:${row}:${col}`;
}

export function chartKey(elId: string): string {
  return `chart:${elId}`;
}

/**
 * 静态表绑定格短标签（无预览实值时显示，避免 NodeId/SQL 语句撑行）。
 */
export function shortBindingKindLabel(bindingKind: string | undefined | null): string {
  if (bindingKind === "opcua") return "⟨UA⟩";
  if (bindingKind === "sql") return "⟨SQL⟩";
  if (bindingKind === "mongo") return "⟨Mongo⟩";
  return "";
}

/**
 * 悬停提示用完整绑定路径（不参与布局）。
 */
export function staticTableCellBindingTitle(cell: {
  bindingKind?: string;
  opcuaNodeId?: string;
  sqlText?: string;
  mongoQuery?: { collection?: string } | null;
} | null | undefined): string {
  if (!cell) return "";
  const kind = cell.bindingKind || "none";
  if (kind === "opcua") return String(cell.opcuaNodeId || "").trim();
  if (kind === "sql") return String(cell.sqlText || "").trim();
  if (kind === "mongo") return String(cell.mongoQuery?.collection || "").trim();
  return "";
}

/**
 * 静态表单元格「布局/换行」文案：优先 OPC/SQL/Mongo 预览实值；
 * 未取到实值时用短占位，避免用 NodeId/SQL 语句抬高行高。
 */
export function resolveStaticTableCellLayoutText(opts: {
  cell: {
    bindingKind?: string;
    text?: string;
    decimalPlaces?: number | null;
  } | null | undefined;
  previewCell: BindingPreviewCell | undefined;
  loading?: boolean;
}): string {
  const { cell, previewCell, loading } = opts;
  if (!cell) return "";
  const kind = cell.bindingKind || "none";
  if (kind === "opcua" || kind === "sql" || kind === "mongo") {
    if (previewCell != null) {
      return applyDecimalPlacesToDisplayText(previewCell.text, cell.decimalPlaces);
    }
    if (loading) return "…";
    return "";
  }
  return String(cell.text || "").trim();
}

/**
 * 静态表单元格显示文案：有预览用实值；加载中用省略号；否则短标签（勿拼 NodeId）。
 */
export function resolveStaticTableCellDisplayText(opts: {
  cell: {
    bindingKind?: string;
    text?: string;
    opcuaNodeId?: string;
    sqlText?: string;
    mongoQuery?: { collection?: string } | null;
    decimalPlaces?: number | null;
  } | null | undefined;
  previewCell: BindingPreviewCell | undefined;
  loading?: boolean;
  unboundLabel?: string;
}): string {
  const { cell, previewCell, loading, unboundLabel } = opts;
  if (!cell) return "\u00a0";
  const kind = cell.bindingKind || "none";
  if (kind === "opcua" || kind === "sql" || kind === "mongo") {
    if (previewCell != null) {
      return applyDecimalPlacesToDisplayText(previewCell.text, cell.decimalPlaces);
    }
    if (loading) return "…";
    if (unboundLabel != null) return unboundLabel;
    return shortBindingKindLabel(kind) || "\u00a0";
  }
  const t = String(cell.text || "").trim();
  return t.length > 0 ? t : "\u00a0";
}

export function connectionSupportsSql(engine: string): boolean {
  const e = (engine || "").toLowerCase();
  return (
    e === "mysql" ||
    e === "mariadb" ||
    e === "postgres" ||
    e === "postgresql" ||
    e === "sqlite"
  );
}

export function connectionSupportsMongo(engine: string): boolean {
  return (engine || "").toLowerCase() === "mongodb";
}

export function pickPreferredOpcServerId(
  prefs: Record<string, unknown> | null | undefined,
  servers: { id: string }[],
): string | null {
  const list = servers || [];
  if (!prefs || prefs.auto_select_last_opcua_server === false) {
    return list[0]?.id ?? null;
  }
  const def = prefs.default_opcua_server_id;
  if (typeof def === "string" && def && list.some((s) => s.id === def)) return def;
  const last = prefs.last_opcua_server_id;
  if (typeof last === "string" && last && list.some((s) => s.id === last)) return last;
  return list[0]?.id ?? null;
}

export function pickPreferredConnectionId(
  prefs: Record<string, unknown> | null | undefined,
  conns: { id: string }[],
): string | null {
  const list = conns || [];
  if (!prefs || prefs.auto_select_last_connection === false) {
    return list[0]?.id ?? null;
  }
  const def = prefs.default_connection_id;
  if (typeof def === "string" && def && list.some((c) => c.id === def)) return def;
  const last = prefs.last_connection_id;
  if (typeof last === "string" && last && list.some((c) => c.id === last)) return last;
  return list[0]?.id ?? null;
}

/** 预览 SQL 绑定时优先选用支持 SQL 查询的连接（跳过 Mongo 等）。 */
export function pickPreferredSqlConnectionId(
  prefs: Record<string, unknown> | null | undefined,
  conns: { id: string; engine?: string }[],
): string | null {
  const sqlConns = (conns || []).filter((c) => connectionSupportsSql(c.engine || ""));
  if (!sqlConns.length) return null;
  return pickPreferredConnectionId(prefs, sqlConns);
}

export function forEachTemplateCanvasElement(
  t: ReportTemplate,
  fn: (el: TemplateElement) => void,
): void {
  const sheets: EditorSheet[] = ["cover", "back"];
  for (const sh of sheets) {
    for (const el of bodyElementsRef(t, sh, 0)) fn(el);
  }
  for (const page of ensureBodyPages(t)) {
    for (const el of page) fn(el);
  }
}

export function forEachZoneLayoutElement(t: ReportTemplate, fn: (el: LayoutZoneElement) => void): void {
  const zones: LayoutZoneElement[] = [
    ...t.headerElements,
    ...t.footerElements,
    ...t.coverHeaderElements,
    ...t.coverFooterElements,
    ...t.coverBodyZoneElements,
    ...t.backHeaderElements,
    ...t.backFooterElements,
    ...t.backBodyZoneElements,
  ];
  for (const el of zones) fn(el);
}

export function formatOpcuaReadPayload(res: unknown): { ok: true; text: string } | { ok: false; err: string } {
  if (!res || typeof res !== "object") return { ok: false, err: "无效响应" };
  const r = res as { ok?: boolean; message?: string; value?: unknown };
  if (r.ok === false) return { ok: false, err: String(r.message || "读值失败") };
  const v = r.value;
  if (v === null) return { ok: true, text: "" };
  if (v === undefined) return { ok: true, text: "" };
  const t = typeof v;
  if (t === "object") {
    try {
      const s = JSON.stringify(v);
      return { ok: true, text: s.length > 160 ? `${s.slice(0, 157)}…` : s };
    } catch {
      return { ok: true, text: String(v) };
    }
  }
  return { ok: true, text: formatScalarForPreviewValue(v) };
}

export function sqlResponseFirstScalar(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { columns?: ({ name?: string } | string)[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const cols = Array.isArray(d.columns) ? d.columns : [];
  if (!rows.length) return "";
  const row = rows[0];
  if (Array.isArray(row)) {
    const x = row[0];
    return formatScalarForPreviewValue(x);
  }
  if (row && typeof row === "object") {
    const keys =
      cols.length > 0
        ? cols
            .map((c) => (typeof c === "string" ? c : String(c?.name || "").trim()))
            .map((c) => c.trim())
            .filter(Boolean)
        : Object.keys(row as object);
    const k = keys[0];
    if (k) return formatScalarForPreviewValue((row as Record<string, unknown>)[k]);
  }
  return formatScalarForPreviewValue(row);
}

export function sqlResponseGridSummary(data: unknown): string {
  if (!data || typeof data !== "object") return "(无数据)";
  const d = data as { columns?: unknown[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const cols = Array.isArray(d.columns) ? d.columns : [];
  if (!rows.length) return "(0 行)";
  return `${rows.length} 行 × ${cols.length || "?"} 列`;
}

/**
 * 后端/驱动常把数据库 DATETIME 序列化成 ISO（`T` 分隔、带 `Z`/`+00:00`）。
 * 报表与数据参数控件按库工具习惯显示为 `YYYY-MM-DD HH:MM:SS[.fff]`（去掉时区后缀）。
 */
const ISO_DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|[+-]\d{2}:?\d{2})?$/i;

/** 将 ISO / 带时区的日期时间字符串规范为库侧常见显示格式；非日期时间则原样返回 */
export function normalizeDbDatetimeDisplay(raw: string): string {
  const m = ISO_DATETIME_RE.exec(raw.trim());
  if (!m) return raw;
  return `${m[1]} ${m[2]}`;
}

export function formatScalarForPreviewValue(
  v: unknown,
  opts?: { decimalPlaces?: number | null },
): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    } catch {
      return String(v);
    }
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const places = normalizeDecimalPlaces(opts?.decimalPlaces);
    if (places !== undefined) return v.toFixed(places);
    let s = String(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  let s = String(v);
  if (typeof v === "string") {
    s = normalizeDbDatetimeDisplay(s);
    const places = normalizeDecimalPlaces(opts?.decimalPlaces);
    if (places !== undefined) s = applyDecimalPlacesToDisplayText(s, places);
  }
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export interface OpcDedupeTask {
  serverId: string;
  nodeId: string;
  keys: string[];
}

export interface SqlDedupeTask {
  connectionId: string;
  sql: string;
  params?: TableSqlParamBinding[];
  keys: string[];
  /**
   * 可视化标量 SQL 选中的库名。MySQL/MariaDB 连接若未配置默认库，
   * 请求必须带上此字段，否则会报 1046 No database selected。
   */
  database?: string;
}

export interface MongoDedupeTask {
  connectionId: string;
  database: string;
  collection: string;
  mode: "find" | "aggregate";
  filterJson: string;
  projectionJson: string;
  sortJson: string;
  pipelineJson: string;
  limit: number;
  valueField: string;
  collectionOpcNodeId: string;
  params?: TableSqlParamBinding[];
  keys: string[];
  /** 整表 Mongo 填充：结果映射列数（物理列或纵表 SELECT 列） */
  tableFillColCount?: number;
}

/** MySQL/MariaDB 默认字符串字面量中反斜杠是转义符；Postgres/SQLite 标准字符串中反斜杠是字面量 */
export function isMysqlFamilyEngine(engine?: string): boolean {
  const e = String(engine || "").toLowerCase();
  return e === "mysql" || e === "mariadb";
}

export function quoteSqlScalarValue(
  value: unknown,
  opts?: { numericStringAsNumber?: boolean; engine?: string },
): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object") {
    try {
      return quoteSqlScalarValue(JSON.stringify(value), opts);
    } catch {
      return quoteSqlScalarValue(String(value), opts);
    }
  }
  const s = String(value);
  if (opts?.numericStringAsNumber && /^-?\d+(\.\d+)?$/.test(s.trim())) return s.trim();
  // 引号按 SQL 标准翻倍；MySQL/MariaDB 另需转义反斜杠，否则尾随反斜杠会逃逸闭合引号（断串/注入）
  const escaped = isMysqlFamilyEngine(opts?.engine)
    ? s.replace(/\\/g, "\\\\").replace(/'/g, "''")
    : s.replace(/'/g, "''");
  return `'${escaped}'`;
}

export function resolveEffectiveScalarSql(
  sqlText: string,
  fillMode?: unknown,
  visual?: ScalarSqlVisualConfig | null,
): string {
  const mode = normalizeScalarSqlFillMode(fillMode, sqlText);
  if (mode === "visual" && visual) {
    const compiled = compileScalarVisualSql(hydrateScalarSqlVisual(visual));
    if (compiled.trim()) return compiled;
  }
  return String(sqlText || "").trim();
}

export type OpcReadResult = { ok?: boolean; message?: string; value?: unknown };

/** OPC/批次号读到的值是否视为「无有效值」（可回退 literalFallback） */
export function isMissingSqlParamOpcValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && !value.trim()) return true;
  return false;
}

/** 解析标量 SQL 的 {{p0}}/{{p1}} 参数值（OPC UA、结批批次号等） */
export async function resolveSqlParamValues(
  params: TableSqlParamBinding[],
  options: {
    defaultOpcServerId: string | null;
    readOpc: (serverId: string, nodeId: string) => Promise<OpcReadResult>;
    batchBinding?: AutoBatchOpcBinding | null;
    onOpcRead?: () => void;
  },
): Promise<Record<number, unknown>> {
  const paramValues: Record<number, unknown> = {};
  const batchBinding = options.batchBinding ?? null;

  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (!p) continue;
    const hasFallback = Boolean((p.literalFallback || "").trim());

    if (p.source === "batch_no") {
      if (!batchBinding) {
        if (hasFallback) continue;
        throw new Error(`SQL 参数 {{p${i}}} 未配置结批批次号 OPC`);
      }
      try {
        options.onOpcRead?.();
        const res = await options.readOpc(batchBinding.serverId, batchBinding.nodeId);
        if (res?.ok === false) {
          if (hasFallback) continue;
          throw new Error(res.message || "结批批次号读取失败");
        }
        if (isMissingSqlParamOpcValue(res.value) && hasFallback) continue;
        paramValues[i] = res.value;
      } catch (e) {
        if (hasFallback) continue;
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`SQL 参数 {{p${i}}} 批次号读取失败：${msg}`);
      }
      continue;
    }

    if (p.source !== "opcua") continue;
    const nodeId = (p.opcuaNodeId || "").trim();
    if (!nodeId) {
      if (hasFallback) continue;
      throw new Error(`SQL 参数 {{p${i}}} 未绑定 OPC UA 节点`);
    }
    const serverId = options.defaultOpcServerId;
    if (!serverId) {
      if (hasFallback) continue;
      throw new Error(`SQL 参数 {{p${i}}} 未配置 OPC UA 连接`);
    }
    try {
      options.onOpcRead?.();
      const res = await options.readOpc(serverId, nodeId);
      if (res?.ok === false) {
        if (hasFallback) continue;
        throw new Error(res.message || "OPC 参数读取失败");
      }
      if (isMissingSqlParamOpcValue(res.value) && hasFallback) continue;
      paramValues[i] = res.value;
    } catch (e) {
      if (hasFallback) continue;
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`SQL 参数 {{p${i}}} 读取失败：${msg}`);
    }
  }

  return paramValues;
}

export function substituteScalarSqlParams(
  sqlRaw: string,
  params: TableSqlParamBinding[] | undefined,
  values: Record<number, unknown>,
  engine?: string,
): string {
  const renderParam = (g: string): string => {
    const i = Number.parseInt(g, 10);
    const p = params?.[i];
    if (!p) return "NULL";
    if (Object.prototype.hasOwnProperty.call(values, i)) {
      return quoteSqlScalarValue(values[i], { numericStringAsNumber: false, engine });
    }
    const lit = (p.literalFallback ?? "").trim();
    if (!lit) return "NULL";
    return quoteSqlScalarValue(lit, { numericStringAsNumber: true, engine });
  };
  return String(sqlRaw || "")
    .replace(/(['"])\s*\{\{p(\d+)\}\}\s*\1/gi, (_all, _quote: string, g: string) => renderParam(g))
    .replace(/\{\{p(\d+)\}\}/gi, (_all, g: string) => renderParam(g));
}

/** 驱动占位符：sqlite 用 `?`，MySQL/MariaDB/Postgres 用 `%s`（与表预览 pk 过滤一致） */
export function sqlParamPlaceholder(engine?: string): "%s" | "?" {
  return String(engine || "").toLowerCase() === "sqlite" ? "?" : "%s";
}

/** 绑定参数值：不进 SQL 文本；语义对齐 quoteSqlScalarValue（数字 fallback、布尔→0/1） */
export function coerceSqlBindValue(
  value: unknown,
  opts?: { numericStringAsNumber?: boolean },
): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  if (opts?.numericStringAsNumber && /^-?\d+(\.\d+)?$/.test(s.trim())) {
    const n = Number(s.trim());
    return Number.isFinite(n) ? n : s;
  }
  return s;
}

/**
 * 将 `{{pN}}` / `'{{pN}}'` 编译为驱动占位符 + 有序 params（真参数化，P2-A）。
 * 占位按出现顺序展开；值不进入 SQL 文本。
 */
export function bindScalarSqlParams(
  sqlRaw: string,
  params: TableSqlParamBinding[] | undefined,
  values: Record<number, unknown>,
  engine?: string,
): { sql: string; params: unknown[] } {
  const ph = sqlParamPlaceholder(engine);
  const bound: unknown[] = [];
  const resolveIndex = (g: string): unknown => {
    const i = Number.parseInt(g, 10);
    const p = params?.[i];
    if (!p) return null;
    if (Object.prototype.hasOwnProperty.call(values, i)) {
      return coerceSqlBindValue(values[i], { numericStringAsNumber: false });
    }
    const lit = (p.literalFallback ?? "").trim();
    if (!lit) return null;
    return coerceSqlBindValue(lit, { numericStringAsNumber: true });
  };
  const sql = String(sqlRaw || "").replace(
    /(['"])\s*\{\{p(\d+)\}\}\s*\1|\{\{p(\d+)\}\}/gi,
    (_all, _quote: string | undefined, gQuoted: string | undefined, gBare: string | undefined) => {
      bound.push(resolveIndex(gQuoted ?? gBare ?? ""));
      return ph;
    },
  );
  return { sql, params: bound };
}

function collectTableSqlFillLabelOpc(
  fill: TableSqlFillConfig,
  elId: string,
  zone: boolean,
  addOpc: (nodeId: string, displayKey?: string) => void,
): void {
  ensureTableSqlResultColumnNames(fill, Math.max(1, fill.resultColumnNames?.length || 1));
  const hdrs = fill.resultColumnNameBindings || [];
  for (let ci = 0; ci < hdrs.length; ci++) {
    const b = hdrs[ci];
    if (b?.bindingKind === "opcua") {
      const nid = String(b.opcuaNodeId || "").trim();
      if (nid) addOpc(nid, tblfillHdrKey(elId, ci, zone));
    }
  }
  if (fill.layoutMode === "vertical" || fill.verticalFieldLabels?.length) {
    ensureVerticalFieldLabels(fill);
    const labs = fill.verticalFieldLabelBindings || [];
    for (let si = 0; si < labs.length; si++) {
      const b = labs[si];
      if (b?.bindingKind === "opcua") {
        const nid = String(b.opcuaNodeId || "").trim();
        if (nid) addOpc(nid, tblfillVlabelKey(elId, si, zone));
      }
    }
    const sep = fill.continueRecordSepLabelBinding;
    if (sep?.bindingKind === "opcua") {
      const nid = String(sep.opcuaNodeId || "").trim();
      if (nid) addOpc(nid, tblfillSepKey(elId, zone));
    }
  }
}

export function collectBindingDedupeTasks(
  t: ReportTemplate,
  opcServerId: string | null,
  sqlConnId: string | null,
): {
  opcTasks: OpcDedupeTask[];
  sqlTasks: SqlDedupeTask[];
  mongoTasks: MongoDedupeTask[];
} {
  const opcMap = new Map<string, OpcDedupeTask>();
  const sqlMap = new Map<string, SqlDedupeTask>();
  const mongoMap = new Map<string, MongoDedupeTask>();

  function addOpc(nodeId: string, displayKey?: string) {
    if (!opcServerId) return;
    const nk = `${opcServerId}\u0000${nodeId}`;
    let e = opcMap.get(nk);
    if (!e) {
      e = { serverId: opcServerId, nodeId, keys: [] };
      opcMap.set(nk, e);
    }
    if (displayKey) e.keys.push(displayKey);
  }

  function addSql(
    sqlRaw: string,
    displayKey: string,
    params?: TableSqlParamBinding[],
    visual?: ScalarSqlVisualConfig | null,
  ) {
    const visualConn = (visual?.connectionId || "").trim();
    const connectionId = visualConn || sqlConnId;
    if (!connectionId) return;
    const sql = sqlRaw.trim();
    if (!sql) return;
    const database = (visual?.database || "").trim() || undefined;
    const paramKey = JSON.stringify(
      (params || []).map((p) => ({
        source: p.source,
        opcuaNodeId: p.opcuaNodeId,
        literalFallback: p.literalFallback,
      })),
    );
    const nk = `${connectionId}\u0000${database || ""}\u0000${sql}\u0000${paramKey}`;
    let e = sqlMap.get(nk);
    if (!e) {
      e = { connectionId, sql, params, keys: [], database };
      sqlMap.set(nk, e);
    }
    e.keys.push(displayKey);
    for (const p of params || []) {
      const nodeId = p?.source === "opcua" ? (p.opcuaNodeId || "").trim() : "";
      if (nodeId) addOpc(nodeId);
    }
  }

  function addMongo(
    mqRaw: MongoQueryConfig | null | undefined,
    displayKey: string,
    params?: TableSqlParamBinding[],
    tableFillColCount?: number,
  ) {
    if (!mqRaw) return;
    const mq = hydrateMongoQuery(mqRaw);
    const connectionId = mq.connectionId.trim();
    if (!connectionId) return;
    const database = mq.database.trim();
    const collection = mq.collection.trim();
    if (!database && !mq.collectionOpcNodeId.trim()) {
      // 仍允许仅有 connectionId 时收集，运行时再报错
    }
    const paramKey = JSON.stringify(
      (params || []).map((p) => ({
        source: p.source,
        opcuaNodeId: p.opcuaNodeId,
        literalFallback: p.literalFallback,
      })),
    );
    const nk = [
      connectionId,
      database,
      collection,
      mq.mode,
      mq.filterJson,
      mq.projectionJson,
      mq.sortJson,
      mq.pipelineJson,
      String(mq.limit),
      mq.valueField,
      mq.collectionOpcNodeId,
      paramKey,
      tableFillColCount != null ? String(tableFillColCount) : "",
    ].join("\u0000");
    let e = mongoMap.get(nk);
    if (!e) {
      e = {
        connectionId,
        database,
        collection,
        mode: mq.mode,
        filterJson: mq.filterJson,
        projectionJson: mq.projectionJson,
        sortJson: mq.sortJson,
        pipelineJson: mq.pipelineJson,
        limit: mq.limit,
        valueField: mq.valueField,
        collectionOpcNodeId: mq.collectionOpcNodeId,
        params,
        keys: [],
        tableFillColCount,
      };
      mongoMap.set(nk, e);
    }
    e.keys.push(displayKey);
    for (const p of params || []) {
      const nodeId = p?.source === "opcua" ? (p.opcuaNodeId || "").trim() : "";
      if (nodeId) addOpc(nodeId);
    }
    const collOpc = mq.collectionOpcNodeId.trim();
    if (collOpc) addOpc(collOpc);
  }

  forEachTemplateCanvasElement(t, (el) => {
    if (el.type === "parameter" || el.type === "text" || el.type === "box") {
      if (el.bindingKind === "opcua") {
        const nid = el.opcuaNodeId.trim();
        if (nid) addOpc(nid, paramKey(el.id));
      } else if (el.type === "parameter" && el.bindingKind === "sql") {
        addSql(
          resolveEffectiveScalarSql(el.sqlText, el.scalarSqlFillMode, el.scalarSqlVisual),
          paramKey(el.id),
          el.sqlParams,
          el.scalarSqlVisual,
        );
      } else if (el.type === "parameter" && el.bindingKind === "mongo") {
        addMongo(el.mongoQuery, paramKey(el.id), el.sqlParams);
      }
    } else if (el.type === "table") {
      const grid = ensureTableGrid(el);
      grid.forEach((row, ri) =>
        row.forEach((cell, ci) => {
          const ck = cellKey(el.id, ri, ci);
          if (cell.bindingKind === "opcua") {
            const nid = cell.opcuaNodeId.trim();
            if (nid) addOpc(nid, ck);
          } else if (cell.bindingKind === "sql") {
            addSql(
              resolveEffectiveScalarSql(cell.sqlText, cell.scalarSqlFillMode, cell.scalarSqlVisual),
              ck,
              cell.sqlParams,
              cell.scalarSqlVisual,
            );
          } else if (cell.bindingKind === "mongo") {
            addMongo(cell.mongoQuery, ck, cell.sqlParams);
          }
        }),
      );
      const fill = el.tableSqlFill;
      if (fill?.enabled) {
        collectTableSqlFillLabelOpc(fill, el.id, false, addOpc);
        if (fill.fillMode === "mongo" && fill.mongoQuery?.connectionId?.trim()) {
          addMongo(fill.mongoQuery, `tblfill:${el.id}`, fill.params, el.tableCols ?? 4);
        }
      }
    } else if (el.type === "chart" && el.bindingKind === "sql") {
      addSql(el.sqlText, chartKey(el.id), el.sqlParams);
    } else if (el.type === "chart" && el.bindingKind === "mongo") {
      addMongo(el.mongoQuery, chartKey(el.id), el.sqlParams);
    }
  });

  forEachZoneLayoutElement(t, (el) => {
    if (el.type === "parameter" || el.type === "text" || el.type === "box") {
      if (el.bindingKind === "opcua") {
        const nid = el.opcuaNodeId.trim();
        if (nid) addOpc(nid, el.type === "parameter" ? `zone-param:${el.id}` : `zone-param:${el.id}`);
      } else if (el.type === "parameter" && el.bindingKind === "sql") {
        addSql(
          resolveEffectiveScalarSql(el.sqlText, el.scalarSqlFillMode, el.scalarSqlVisual),
          `zone-param:${el.id}`,
          el.sqlParams,
          el.scalarSqlVisual,
        );
      } else if (el.type === "parameter" && el.bindingKind === "mongo") {
        addMongo(el.mongoQuery, `zone-param:${el.id}`, el.sqlParams);
      }
    } else if (el.type === "table") {
      const grid = ensureZoneTableGrid(el);
      grid.forEach((row, ri) =>
        row.forEach((cell, ci) => {
          const ck = `zone-cell:${el.id}:${ri}:${ci}`;
          if (cell.bindingKind === "opcua") {
            const nid = cell.opcuaNodeId.trim();
            if (nid) addOpc(nid, ck);
          } else if (cell.bindingKind === "sql") {
            addSql(
              resolveEffectiveScalarSql(cell.sqlText, cell.scalarSqlFillMode, cell.scalarSqlVisual),
              ck,
              cell.sqlParams,
              cell.scalarSqlVisual,
            );
          } else if (cell.bindingKind === "mongo") {
            addMongo(cell.mongoQuery, ck, cell.sqlParams);
          }
        }),
      );
      const fill = el.tableSqlFill;
      if (fill?.enabled) {
        collectTableSqlFillLabelOpc(fill, el.id, true, addOpc);
        if (fill.fillMode === "mongo" && fill.mongoQuery?.connectionId?.trim()) {
          addMongo(fill.mongoQuery, `ztblfill:${el.id}`, fill.params, el.tableCols ?? 4);
        }
      }
    }
  });

  return {
    opcTasks: [...opcMap.values()],
    sqlTasks: [...sqlMap.values()],
    mongoTasks: [...mongoMap.values()],
  };
}
