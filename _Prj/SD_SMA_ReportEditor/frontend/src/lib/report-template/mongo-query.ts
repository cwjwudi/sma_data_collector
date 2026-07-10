/**
 * MongoDB 报表绑定配置（与后端 MongoQueryConfig 对齐）。
 * filter/projection/sort/pipeline 以 JSON 文本持久化，运行时替换 {{pN}} 后解析。
 */

export type MongoQueryMode = "find" | "aggregate";

export interface MongoQueryConfig {
  connectionId: string;
  database: string;
  collection: string;
  mode: MongoQueryMode;
  filterJson: string;
  projectionJson: string;
  sortJson: string;
  pipelineJson: string;
  limit: number;
  /** 标量取值字段名；空则取首行首列 */
  valueField: string;
  /** 可选：运行时用 OPC 节点值替换集合名 */
  collectionOpcNodeId: string;
}

export function defaultMongoQueryConfig(): MongoQueryConfig {
  return {
    connectionId: "",
    database: "",
    collection: "",
    mode: "find",
    filterJson: "{}",
    projectionJson: "",
    sortJson: "",
    pipelineJson: "[]",
    limit: 200,
    valueField: "",
    collectionOpcNodeId: "",
  };
}

function clampMongoLimit(v: unknown, fallback = 200): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5000, Math.max(1, n));
}

function normalizeMongoMode(v: unknown): MongoQueryMode {
  return v === "aggregate" ? "aggregate" : "find";
}

/** 规范持久化对象；缺字段时补默认值 */
export function hydrateMongoQuery(raw: unknown): MongoQueryConfig {
  const d = defaultMongoQueryConfig();
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    connectionId: typeof o.connectionId === "string" ? o.connectionId : d.connectionId,
    database: typeof o.database === "string" ? o.database : d.database,
    collection: typeof o.collection === "string" ? o.collection : d.collection,
    mode: normalizeMongoMode(o.mode),
    filterJson: typeof o.filterJson === "string" ? o.filterJson : d.filterJson,
    projectionJson: typeof o.projectionJson === "string" ? o.projectionJson : d.projectionJson,
    sortJson: typeof o.sortJson === "string" ? o.sortJson : d.sortJson,
    pipelineJson: typeof o.pipelineJson === "string" ? o.pipelineJson : d.pipelineJson,
    limit: clampMongoLimit(o.limit, d.limit),
    valueField: typeof o.valueField === "string" ? o.valueField : d.valueField,
    collectionOpcNodeId:
      typeof o.collectionOpcNodeId === "string" ? o.collectionOpcNodeId : d.collectionOpcNodeId,
  };
}

/** 仅在有实质配置时水合；全空则返回 undefined（避免为每格写入默认对象） */
export function hydrateMongoQueryOptional(raw: unknown): MongoQueryConfig | undefined {
  if (raw == null) return undefined;
  const q = hydrateMongoQuery(raw);
  if (
    !q.connectionId.trim() &&
    !q.database.trim() &&
    !q.collection.trim() &&
    !q.collectionOpcNodeId.trim() &&
    !q.valueField.trim() &&
    (q.filterJson.trim() === "" || q.filterJson.trim() === "{}") &&
    !q.projectionJson.trim() &&
    !q.sortJson.trim() &&
    (q.pipelineJson.trim() === "" || q.pipelineJson.trim() === "[]")
  ) {
    return undefined;
  }
  return q;
}

/**
 * 将 JSON 文本中的 {{p0}}/{{p1}}… 替换为参数值后 JSON.parse。
 * 字符串字面量内的占位符替换为 JSON 编码后的值；裸占位符替换为 JSON 字面量。
 */
export function substituteMongoJsonParams(
  jsonText: string,
  paramValues: Record<number, unknown>,
): unknown {
  const raw = String(jsonText ?? "").trim();
  if (!raw) return undefined;
  const render = (g: string): string => {
    const i = Number.parseInt(g, 10);
    if (!Object.prototype.hasOwnProperty.call(paramValues, i)) return "null";
    try {
      return JSON.stringify(paramValues[i] ?? null);
    } catch {
      return "null";
    }
  };
  const substituted = raw
    .replace(/(['"])\s*\{\{p(\d+)\}\}\s*\1/gi, (_all, _q: string, g: string) => render(g))
    .replace(/\{\{p(\d+)\}\}/gi, (_all, g: string) => render(g));
  return JSON.parse(substituted);
}

/** OPC 读到的集合名：去空白；非法字符时返回空串 */
export function substituteMongoCollection(collection: string, opcValue: unknown): string {
  const fromOpc =
    opcValue === null || opcValue === undefined ? "" : String(opcValue).trim();
  if (fromOpc) {
    if (/^[a-zA-Z0-9_.$-]+$/.test(fromOpc)) return fromOpc;
    return "";
  }
  return String(collection ?? "").trim();
}

export function parseMongoFilterJson(text: string, paramValues?: Record<number, unknown>): Record<string, unknown> {
  const v = substituteMongoJsonParams(text.trim() || "{}", paramValues || {});
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

export function parseMongoProjectionJson(
  text: string,
  paramValues?: Record<number, unknown>,
): Record<string, unknown> | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const v = substituteMongoJsonParams(t, paramValues || {});
  if (v == null || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

export function parseMongoSortJson(
  text: string,
  paramValues?: Record<number, unknown>,
): Record<string, number> | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const v = substituteMongoJsonParams(t, paramValues || {});
  if (v == null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n < 0 ? -1 : 1;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseMongoPipelineJson(text: string, paramValues?: Record<number, unknown>): unknown[] {
  const v = substituteMongoJsonParams(text.trim() || "[]", paramValues || {});
  return Array.isArray(v) ? v : [];
}

/** 从 Mongo 查询响应取标量：优先 valueField，否则首行首列 */
export function mongoResponseScalar(data: unknown, valueField?: string): string {
  const field = (valueField || "").trim();
  if (!data || typeof data !== "object") return "";
  const d = data as { columns?: ({ name?: string } | string)[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (!rows.length) return "";
  const row = rows[0];
  if (field && row && typeof row === "object" && !Array.isArray(row)) {
    return formatMongoScalar((row as Record<string, unknown>)[field]);
  }
  if (Array.isArray(row)) return formatMongoScalar(row[0]);
  if (row && typeof row === "object") {
    const cols = Array.isArray(d.columns) ? d.columns : [];
    const keys =
      cols.length > 0
        ? cols
            .map((c) => (typeof c === "string" ? c : String(c?.name || "").trim()))
            .map((c) => c.trim())
            .filter(Boolean)
        : Object.keys(row as object);
    const k = keys[0];
    if (k) return formatMongoScalar((row as Record<string, unknown>)[k]);
  }
  return formatMongoScalar(row);
}

function formatMongoScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}
