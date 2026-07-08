import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages, ensureTableGrid } from "@/lib/report-template/model";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { ensureZoneTableGrid } from "@/lib/report-template/layout-zone-element";
import { bodyElementsRef, type EditorSheet } from "@/lib/report-template/editor-sheet";
import type { TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import { hydrateScalarSqlVisual, normalizeScalarSqlFillMode, type ScalarSqlVisualConfig } from "@/lib/report-template/scalar-sql-visual";
import { compileScalarVisualSql } from "@/lib/report-template/scalar-sql-visual-compile";
import type { AutoBatchOpcBinding } from "@/lib/auto-batch-opc-binding";

/** 表格「整表 SQL 填充」在编辑器中的查询预览（非持久化字段） */
export interface TableSqlFillPreviewPayload {
  dataRows: string[][];
  error?: string;
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
  if (v === null) return { ok: true, text: "null" };
  if (v === undefined) return { ok: true, text: "undefined" };
  const t = typeof v;
  if (t === "object") {
    try {
      const s = JSON.stringify(v);
      return { ok: true, text: s.length > 160 ? `${s.slice(0, 157)}…` : s };
    } catch {
      return { ok: true, text: String(v) };
    }
  }
  if (t === "string") {
    const s = v as string;
    return { ok: true, text: s.length > 120 ? `${s.slice(0, 117)}…` : s };
  }
  return { ok: true, text: String(v) };
}

export function sqlResponseFirstScalar(data: unknown): string {
  if (!data || typeof data !== "object") return "(空结果)";
  const d = data as { columns?: ({ name?: string } | string)[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const cols = Array.isArray(d.columns) ? d.columns : [];
  if (!rows.length) return "(空结果)";
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

/** 后端把数据库 datetime JSON 序列化成 ISO 格式（T 分隔），报表显示还原为空格分隔 */
const ISO_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/;

export function formatScalarForPreviewValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    } catch {
      return String(v);
    }
  }
  let s = String(v);
  if (typeof v === "string") {
    const m = ISO_DATETIME_RE.exec(s.trim());
    if (m) s = `${m[1]} ${m[2]}`;
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
}

export function quoteSqlScalarValue(value: unknown, opts?: { numericStringAsNumber?: boolean }): string {
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
  return `'${s.replace(/'/g, "''")}'`;
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

    if (p.source === "batch_no") {
      if (!batchBinding) {
        if ((p.literalFallback || "").trim()) continue;
        throw new Error(`SQL 参数 {{p${i}}} 未配置结批批次号 OPC`);
      }
      try {
        options.onOpcRead?.();
        const res = await options.readOpc(batchBinding.serverId, batchBinding.nodeId);
        if (res?.ok === false) {
          if ((p.literalFallback || "").trim()) continue;
          throw new Error(res.message || "结批批次号读取失败");
        }
        if ((res.value === null || res.value === undefined) && (p.literalFallback || "").trim()) continue;
        paramValues[i] = res.value;
      } catch (e) {
        if ((p.literalFallback || "").trim()) continue;
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`SQL 参数 {{p${i}}} 批次号读取失败：${msg}`);
      }
      continue;
    }

    if (p.source !== "opcua") continue;
    const nodeId = (p.opcuaNodeId || "").trim();
    if (!nodeId) {
      if ((p.literalFallback || "").trim()) continue;
      throw new Error(`SQL 参数 {{p${i}}} 未绑定 OPC UA 节点`);
    }
    const serverId = options.defaultOpcServerId;
    if (!serverId) {
      if ((p.literalFallback || "").trim()) continue;
      throw new Error(`SQL 参数 {{p${i}}} 未配置 OPC UA 连接`);
    }
    try {
      options.onOpcRead?.();
      const res = await options.readOpc(serverId, nodeId);
      if (res?.ok === false) {
        if ((p.literalFallback || "").trim()) continue;
        throw new Error(res.message || "OPC 参数读取失败");
      }
      if ((res.value === null || res.value === undefined) && (p.literalFallback || "").trim()) continue;
      paramValues[i] = res.value;
    } catch (e) {
      if ((p.literalFallback || "").trim()) continue;
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
): string {
  const renderParam = (g: string): string => {
    const i = Number.parseInt(g, 10);
    const p = params?.[i];
    if (!p) return "NULL";
    if (Object.prototype.hasOwnProperty.call(values, i)) {
      return quoteSqlScalarValue(values[i], { numericStringAsNumber: false });
    }
    const lit = (p.literalFallback ?? "").trim();
    if (!lit) return "NULL";
    return quoteSqlScalarValue(lit, { numericStringAsNumber: true });
  };
  return String(sqlRaw || "")
    .replace(/(['"])\s*\{\{p(\d+)\}\}\s*\1/gi, (_all, _quote: string, g: string) => renderParam(g))
    .replace(/\{\{p(\d+)\}\}/gi, (_all, g: string) => renderParam(g));
}

export function collectBindingDedupeTasks(
  t: ReportTemplate,
  opcServerId: string | null,
  sqlConnId: string | null,
): {
  opcTasks: OpcDedupeTask[];
  sqlTasks: SqlDedupeTask[];
} {
  const opcMap = new Map<string, OpcDedupeTask>();
  const sqlMap = new Map<string, SqlDedupeTask>();

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

  function addSql(sqlRaw: string, displayKey: string, params?: TableSqlParamBinding[]) {
    if (!sqlConnId) return;
    const sql = sqlRaw.trim();
    if (!sql) return;
    const paramKey = JSON.stringify(
      (params || []).map((p) => ({
        source: p.source,
        opcuaNodeId: p.opcuaNodeId,
        literalFallback: p.literalFallback,
      })),
    );
    const nk = `${sqlConnId}\u0000${sql}\u0000${paramKey}`;
    let e = sqlMap.get(nk);
    if (!e) {
      e = { connectionId: sqlConnId, sql, params, keys: [] };
      sqlMap.set(nk, e);
    }
    e.keys.push(displayKey);
    for (const p of params || []) {
      const nodeId = p?.source === "opcua" ? (p.opcuaNodeId || "").trim() : "";
      if (nodeId) addOpc(nodeId);
    }
  }

  forEachTemplateCanvasElement(t, (el) => {
    if (el.type === "parameter") {
      if (el.bindingKind === "opcua") {
        const nid = el.opcuaNodeId.trim();
        if (nid) addOpc(nid, paramKey(el.id));
      } else if (el.bindingKind === "sql") {
        addSql(
          resolveEffectiveScalarSql(el.sqlText, el.scalarSqlFillMode, el.scalarSqlVisual),
          paramKey(el.id),
          el.sqlParams,
        );
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
            );
          }
        }),
      );
    } else if (el.type === "chart" && el.bindingKind === "sql") {
      addSql(el.sqlText, chartKey(el.id), el.sqlParams);
    }
  });

  forEachZoneLayoutElement(t, (el) => {
    if (el.type === "parameter") {
      if (el.bindingKind === "opcua") {
        const nid = el.opcuaNodeId.trim();
        if (nid) addOpc(nid, `zone-param:${el.id}`);
      } else if (el.bindingKind === "sql") {
        addSql(
          resolveEffectiveScalarSql(el.sqlText, el.scalarSqlFillMode, el.scalarSqlVisual),
          `zone-param:${el.id}`,
          el.sqlParams,
        );
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
            );
          }
        }),
      );
    }
  });

  return {
    opcTasks: [...opcMap.values()],
    sqlTasks: [...sqlMap.values()],
  };
}
