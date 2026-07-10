/**
 * 表格「整表 SQL 结果集」动态填充（schemaVersion≥4）。
 * 导出时由生成器执行查询、按行展开并处理跨页续表；编辑器仅持久化配置。
 */

import { TEMPLATE_TABLE_MAX_COLS, TEMPLATE_TABLE_MAX_ROWS } from "@/lib/report-template/table-cell-metrics";
import { normalizeDecimalPlaces } from "@/lib/report-template/numeric-display";

export type TableSqlParamSource = "opcua" | "literal" | "batch_no";

export interface TableSqlParamBinding {
  source: TableSqlParamSource;
  opcuaNodeId: string;
  /** 保留字段（兼容旧 JSON）；编辑器已不再提供「同列上方」绑定 */
  aboveCellColumnIndex: number;
  /** OPC 无值或手写占位时的字面兜底（生成器替换占位符） */
  literalFallback?: string;
}

export type TableSqlFillMode = "manual_sql" | "visual";

/**
 * 表格展示形态：
 * - horizontal：横表（一行 SQL 结果 → 一行表格；多列对应多字段）
 * - vertical：纵表（固定两列：左字段名、右字段值；一行 SQL 结果展开为多行 KV）
 */
export type TableSqlLayoutMode = "horizontal" | "vertical";

/**
 * 横表物理列角色（与 tableCols / visualSource.columns 对齐）：
 * - field：绑定库字段
 * - blank：空白列（不取数，单元格恒空）
 * - sequence：自动序号列（渲染时计算，不进 SELECT）
 */
export type TableSqlColumnRole = "field" | "blank" | "sequence";

/** 序号跨页策略：continuous=整份连续；restart_per_page=每页从 1 重计 */
export type TableSqlSequencePageMode = "continuous" | "restart_per_page";

/**
 * 纵表多条 SQL 结果的分页策略：
 * - continue：多条记录在同一表内续表（组间可插空白分隔），超出页高再跨页续排
 * - page_per_record：每条 SQL 结果单独占一页（另起一页）
 */
export type TableSqlVerticalMultiRecordMode = "continue" | "page_per_record";

/** 画布/属性面板列下拉中的哨兵值（非真实库字段名） */
export const TABLE_SQL_COLUMN_PICK_BLANK = "";
export const TABLE_SQL_COLUMN_PICK_SEQUENCE = "__sequence__";
/** 纵表：已添加字段行但尚未选择库字段（勿与空白分隔的空串混淆） */
export const TABLE_SQL_VERTICAL_FIELD_PENDING = "__field__";

/**
 * 表名来源：
 * - manual：导出/预览直接用 visualSource.table
 * - opcua：导出/预览读 OPC 变量作实际表名；visualSource.table 仍必须是库中现存表，
 *   专供设计时拉列清单、筛选列点选，并在 OPC 读失败或值非法时作兜底
 */
export type TableSqlTableSource = "manual" | "opcua";

/** OPC 表名选择在 opcPickParam 槽位通道中的专用哨兵值（普通筛选参数槽位从 0 起） */
export const TABLE_SQL_FILL_TABLE_PICK_SLOT = -1;

/** 已保存连接上的物理库名（SQLite 可留空） */
export interface TableSqlVisualSource {
  connectionId: string;
  database: string;
  /**
   * 结构参考表（库中现存表名，字母数字下划线）。
   * 无论 tableSource 为何，设计时列下拉 / 筛选列 / DISTINCT 样例均据此表加载；
   * tableSource=opcua 时同时作为 OPC 读失败时的兜底表名。
   */
  table: string;
  /** 保存选型当时的引擎：mysql | mariadb | postgres | sqlite（用于标识符引用） */
  engine: string;
  /** SELECT 列顺序，需与表格数据列、resultColumnNames 对齐 */
  columns: string[];
  /** 表名来源（默认 manual；opcua 时编译产出 {{table}} 占位符，导出时替换） */
  tableSource?: TableSqlTableSource;
  /** tableSource=opcua 时读取表名的 OPC UA 节点（使用默认 OPC 连接） */
  tableOpcNodeId?: string;
}

/** 设计时用于拉列清单的表名（始终取 visualSource.table，与 OPC 运行时表名解耦） */
export function visualSqlStructureTableName(vs: TableSqlVisualSource | null | undefined): string {
  return String(vs?.table ?? "").trim();
}

/** OPC 表名模式下是否已选定结构参考表（缺则画布/筛选列下拉为空） */
export function visualSqlNeedsStructureTable(vs: TableSqlVisualSource | null | undefined): boolean {
  if (!vs) return false;
  return vs.tableSource === "opcua" && !visualSqlStructureTableName(vs);
}

export type VisualSqlFilterKind = "equality" | "datetime_between" | "date_between" | "numeric_between";

export interface VisualSqlFilter {
  id: string;
  column: string;
  kind: VisualSqlFilterKind;
  /** equality：长度 1；between：长度 2（起止日期或数值） */
  defaults: string[];
  bindings: TableSqlParamBinding[];
}

export interface TableSqlFillConfig {
  enabled: boolean;
  /** manual_sql：手写；visual：由编辑器根据数据源与筛选编译生成 */
  fillMode: TableSqlFillMode;
  /** 只读 SELECT；可使用占位符 {{p0}}、{{p1}}…（与 params 顺序一致） */
  querySql: string;
  params: TableSqlParamBinding[];
  /**
   * 横表：与物理列数一致的表头文案。
   * 纵表：仅使用前两项作为两列表头（如「名称」「值」）；左列字段标签见 verticalFieldLabels。
   */
  resultColumnNames: string[];
  /** 跨页时在新页重复表头行（第 0 行） */
  repeatHeaderOnPageBreak: boolean;
  /** 查询结果超过 maxRows 时，按 maxRows 拆成多份报表导出；开启时模板中只能有一个数据库填充表 */
  splitReportsOnMaxRows: boolean;
  /**
   * 允许在同一正文画布上，把控件摆放在 SQL 动态表格「逻辑底线」之下。
   * 默认关闭：编辑画布会阻止重叠区域内的下移；导出预览中此类控件会另起一页。
   */
  allowWidgetsBelowSqlFillTable: boolean;
  /** 最大返回行数（截断保护）；查询结果少于此值则只显示实际行数 */
  maxRows: number;
  /** fillMode===visual 时的数据源选择（手写模式下可残留但不生效） */
  visualSource?: TableSqlVisualSource | null;
  visualFilters: VisualSqlFilter[];
  /** 横表 / 纵表；缺省 horizontal（兼容旧模版） */
  layoutMode?: TableSqlLayoutMode;
  /**
   * 横表物理列角色（与 tableCols 对齐）。
   * 纵表忽略此数组；纵表空白分隔行用 visualSource.columns 中的空串表示。
   */
  columnRoles?: TableSqlColumnRole[];
  /** 序号列跨页编号策略；缺省 continuous */
  sequencePageMode?: TableSqlSequencePageMode;
  /**
   * 纵表多条查询结果：continue=同表续表；page_per_record=每条结果另起一页。
   * 缺省 continue（兼容旧模版）。
   */
  verticalMultiRecordMode?: TableSqlVerticalMultiRecordMode;
  /**
   * 纵表：与 visualSource.columns 对齐的左列显示标签。
   * 空串时回退为字段名；空白分隔行左右皆空。
   */
  verticalFieldLabels?: string[];
  /**
   * 数据库填充结果中数值列的小数位数；未设则保持查询原样。
   * 对可解析为有限数字的单元格生效（REAL/浮点）。
   */
  decimalPlaces?: number;
}

export function defaultSqlParam(): TableSqlParamBinding {
  /** 新建槽位默认用手写值，便于预览与常见「固定条件」场景 */
  return { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "" };
}

export function hydrateSqlParamBindings(raw: unknown, minSlots = 0): TableSqlParamBinding[] {
  const paramsRaw = Array.isArray(raw) ? raw : [];
  const params: TableSqlParamBinding[] = [];
  for (let i = 0; i < paramsRaw.length; i++) {
    const pr = paramsRaw[i];
    if (!pr || typeof pr !== "object") {
      params.push(defaultSqlParam());
      continue;
    }
    const p = pr as Record<string, unknown>;
    params.push({
      source: normalizeParamSource(p.source),
      opcuaNodeId: typeof p.opcuaNodeId === "string" ? p.opcuaNodeId : "",
      aboveCellColumnIndex: clampColIndex(p.aboveCellColumnIndex),
      literalFallback: typeof p.literalFallback === "string" ? p.literalFallback : "",
    });
  }
  ensureSqlParamSlots(params, minSlots);
  return params;
}

export function ensureSqlParamSlots(params: TableSqlParamBinding[], minSlots: number): void {
  const n = Math.max(0, Math.min(32, Math.floor(Number(minSlots)) || 0));
  while (params.length < n) params.push(defaultSqlParam());
}

export function defaultVisualSqlFilter(): VisualSqlFilter {
  return {
    id: crypto.randomUUID?.() ?? `flt_${Math.random().toString(36).slice(2, 11)}`,
    column: "",
    kind: "equality",
    defaults: [""],
    bindings: [defaultSqlParam()],
  };
}

export function defaultVisualSource(): TableSqlVisualSource {
  return {
    connectionId: "",
    database: "",
    table: "",
    engine: "",
    columns: [],
    tableSource: "manual",
    tableOpcNodeId: "",
  };
}

export function ensureVisualSource(fill: TableSqlFillConfig): TableSqlVisualSource {
  if (!fill.visualSource) fill.visualSource = defaultVisualSource();
  return fill.visualSource;
}

export function defaultTableSqlFillConfig(): TableSqlFillConfig {
  return {
    enabled: false,
    fillMode: "visual",
    querySql: "",
    params: [],
    resultColumnNames: [],
    repeatHeaderOnPageBreak: true,
    splitReportsOnMaxRows: false,
    allowWidgetsBelowSqlFillTable: false,
    maxRows: 2000,
    visualSource: null,
    visualFilters: [],
    layoutMode: "horizontal",
    columnRoles: [],
    sequencePageMode: "continuous",
    verticalMultiRecordMode: "continue",
    verticalFieldLabels: [],
  };
}

export function normalizeTableSqlLayoutMode(v: unknown): TableSqlLayoutMode {
  return v === "vertical" ? "vertical" : "horizontal";
}

export function normalizeTableSqlColumnRole(v: unknown): TableSqlColumnRole {
  if (v === "blank" || v === "sequence") return v;
  return "field";
}

export function normalizeTableSqlSequencePageMode(v: unknown): TableSqlSequencePageMode {
  return v === "restart_per_page" ? "restart_per_page" : "continuous";
}

export function normalizeTableSqlVerticalMultiRecordMode(v: unknown): TableSqlVerticalMultiRecordMode {
  return v === "page_per_record" ? "page_per_record" : "continue";
}

export function isVerticalSqlFill(fill: TableSqlFillConfig | null | undefined): boolean {
  return !!fill?.enabled && normalizeTableSqlLayoutMode(fill.layoutMode) === "vertical";
}

/** 纵表固定两列 */
export const VERTICAL_SQL_FILL_COL_COUNT = 2;

/** 令横表 columnRoles 与列数对齐；纵表不强制 */
export function ensureTableSqlColumnRoles(fill: TableSqlFillConfig, colCount: number): void {
  if (isVerticalSqlFill(fill)) return;
  const n = Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(colCount)) || 1));
  if (!fill.columnRoles) fill.columnRoles = [];
  const arr = fill.columnRoles;
  while (arr.length < n) {
    const field = String(fill.visualSource?.columns?.[arr.length] ?? "").trim();
    arr.push(field ? "field" : "blank");
  }
  arr.length = n;
}

/** 纵表：verticalFieldLabels 与 visualSource.columns 对齐 */
export function ensureVerticalFieldLabels(fill: TableSqlFillConfig): void {
  if (!fill.visualSource) return;
  if (!fill.verticalFieldLabels) fill.verticalFieldLabels = [];
  const n = fill.visualSource.columns.length;
  const arr = fill.verticalFieldLabels;
  while (arr.length < n) arr.push("");
  arr.length = n;
}

/** 纵表槽位是否为空白分隔行（空串） */
export function isVerticalSqlSlotBlank(slotField: string | null | undefined): boolean {
  return !String(slotField ?? "").trim();
}

/** 纵表槽位是否为「待选字段」占位 */
export function isVerticalSqlSlotPending(slotField: string | null | undefined): boolean {
  return String(slotField ?? "").trim() === TABLE_SQL_VERTICAL_FIELD_PENDING;
}

/** 纵表槽位是否已绑定真实库字段 */
export function isVerticalSqlSlotBoundField(slotField: string | null | undefined): boolean {
  const t = String(slotField ?? "").trim();
  return !!t && t !== TABLE_SQL_VERTICAL_FIELD_PENDING;
}

/** 纵表左列标签：自定义标签优先，否则字段名；空白分隔 / 待选行为空或占位文案由调用方处理 */
export function verticalSlotLabel(fill: TableSqlFillConfig, slotIndex: number): string {
  const field = String(fill.visualSource?.columns?.[slotIndex] ?? "").trim();
  if (!field || field === TABLE_SQL_VERTICAL_FIELD_PENDING) return "";
  const custom = String(fill.verticalFieldLabels?.[slotIndex] ?? "").trim();
  return custom || field;
}

/** SELECT 实际输出的库字段（跳过空白分隔 / 待选占位 / 横表 blank·sequence） */
export function visualSqlSelectFieldNames(fill: TableSqlFillConfig): string[] {
  const vs = fill.visualSource;
  if (!vs) return [];
  if (isVerticalSqlFill(fill)) {
    return vs.columns.map((c) => String(c ?? "").trim()).filter(isVerticalSqlSlotBoundField);
  }
  ensureTableSqlColumnRoles(fill, vs.columns.length || 1);
  const roles = fill.columnRoles || [];
  const out: string[] = [];
  for (let i = 0; i < vs.columns.length; i++) {
    const role = roles[i] ?? "field";
    if (role !== "field") continue;
    const t = String(vs.columns[i] ?? "").trim();
    if (t) out.push(t);
  }
  return out;
}

function normalizeParamSource(v: unknown): TableSqlParamSource {
  if (v === "literal") return "literal";
  if (v === "batch_no") return "batch_no";
  /** 旧版「同列上方」已移除，加载时按字面量处理 */
  if (v === "above_cell") return "literal";
  return "opcua";
}

export function validateSqlIdentifier(name: string): void {
  const s = String(name ?? "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error(`非法标识符：${name}`);
  }
}

/** 规范持久化对象；补齐 params 至少 minSlots（兼容旧模板为 2） */
export function hydrateTableSqlFill(raw: unknown): TableSqlFillConfig {
  const d = defaultTableSqlFillConfig();
  if (!raw || typeof raw !== "object") {
    ensureMinTableSqlParamSlots(d, 2);
    return d;
  }
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true || o.enabled === "true" || o.enabled === 1;
  const querySqlEarly = typeof o.querySql === "string" ? o.querySql : "";
  const fillMode: TableSqlFillMode =
    o.fillMode === "visual" || o.fillMode === "manual_sql"
      ? (o.fillMode as TableSqlFillMode)
      : querySqlEarly.trim().length > 0
        ? "manual_sql"
        : "visual";
  const querySql = querySqlEarly;
  const repeatHeaderOnPageBreak =
    o.repeatHeaderOnPageBreak === false || o.repeatHeaderOnPageBreak === "false" ? false : true;
  const splitReportsOnMaxRows =
    o.splitReportsOnMaxRows === true || o.splitReportsOnMaxRows === "true" || o.splitReportsOnMaxRows === 1;
  const allowWidgetsBelowSqlFillTable =
    o.allowWidgetsBelowSqlFillTable === true || o.allowWidgetsBelowSqlFillTable === "true" ? true : false;
  let maxRows = Math.round(Number(o.maxRows));
  if (!Number.isFinite(maxRows)) maxRows = d.maxRows;
  maxRows = Math.min(50000, Math.max(1, maxRows));

  const namesIn = Array.isArray(o.resultColumnNames) ? o.resultColumnNames : [];
  const resultColumnNames = namesIn.map((x) => (typeof x === "string" ? x : String(x ?? "")));

  const paramsRaw = Array.isArray(o.params) ? o.params : [];
  const params: TableSqlParamBinding[] = [];
  for (let i = 0; i < paramsRaw.length; i++) {
    const pr = paramsRaw[i];
    if (!pr || typeof pr !== "object") {
      params.push(defaultSqlParam());
      continue;
    }
    const p = pr as Record<string, unknown>;
    params.push({
      source: normalizeParamSource(p.source),
      opcuaNodeId: typeof p.opcuaNodeId === "string" ? p.opcuaNodeId : "",
      aboveCellColumnIndex: clampColIndex(p.aboveCellColumnIndex),
      literalFallback: typeof p.literalFallback === "string" ? p.literalFallback : "",
    });
  }

  let visualSource: TableSqlVisualSource | null = null;
  const vs = o.visualSource;
  if (vs && typeof vs === "object") {
    const v = vs as Record<string, unknown>;
    visualSource = {
      connectionId: typeof v.connectionId === "string" ? v.connectionId : "",
      database: typeof v.database === "string" ? v.database : "",
      table: typeof v.table === "string" ? v.table : "",
      engine: typeof v.engine === "string" ? v.engine : "",
      columns: Array.isArray(v.columns) ? v.columns.map((x) => String(x ?? "")) : [],
      tableSource: v.tableSource === "opcua" ? "opcua" : "manual",
      tableOpcNodeId: typeof v.tableOpcNodeId === "string" ? v.tableOpcNodeId : "",
    };
  }

  const vfRaw = Array.isArray(o.visualFilters) ? o.visualFilters : [];
  const visualFilters: VisualSqlFilter[] = vfRaw.map((item, idx) => {
    if (!item || typeof item !== "object") {
      const x = defaultVisualSqlFilter();
      normalizeVisualSqlFilterShape(x);
      return x;
    }
    const r = item as Record<string, unknown>;
    const kindRaw = r.kind;
    const kind: VisualSqlFilterKind =
      kindRaw === "datetime_between" ||
      kindRaw === "date_between" ||
      kindRaw === "numeric_between" ||
      kindRaw === "equality"
        ? kindRaw
        : "equality";
    const id =
      typeof r.id === "string" && r.id.trim()
        ? r.id.trim()
        : `flt_${idx}_${Math.random().toString(36).slice(2, 9)}`;
    const column = typeof r.column === "string" ? r.column : "";
    const defaultsIn = Array.isArray(r.defaults) ? r.defaults : [];
    const defaults = defaultsIn.map((x) => (typeof x === "string" ? x : String(x ?? "")));
    const bindingsIn = Array.isArray(r.bindings) ? r.bindings : [];
    const bindings: TableSqlParamBinding[] = [];
    for (let j = 0; j < bindingsIn.length; j++) {
      const pr = bindingsIn[j];
      if (!pr || typeof pr !== "object") {
        bindings.push(defaultSqlParam());
        continue;
      }
      const p = pr as Record<string, unknown>;
      bindings.push({
        source: normalizeParamSource(p.source),
        opcuaNodeId: typeof p.opcuaNodeId === "string" ? p.opcuaNodeId : "",
        aboveCellColumnIndex: clampColIndex(p.aboveCellColumnIndex),
        literalFallback: typeof p.literalFallback === "string" ? p.literalFallback : "",
      });
    }
    const vf: VisualSqlFilter = { id, column, kind, defaults, bindings };
    normalizeVisualSqlFilterShape(vf);
    return vf;
  });

  const layoutMode = normalizeTableSqlLayoutMode(o.layoutMode);
  const sequencePageMode = normalizeTableSqlSequencePageMode(o.sequencePageMode);
  const verticalMultiRecordMode = normalizeTableSqlVerticalMultiRecordMode(o.verticalMultiRecordMode);
  const rolesIn = Array.isArray(o.columnRoles) ? o.columnRoles : [];
  const columnRoles: TableSqlColumnRole[] = rolesIn.map((x) => normalizeTableSqlColumnRole(x));
  const labelsIn = Array.isArray(o.verticalFieldLabels) ? o.verticalFieldLabels : [];
  const verticalFieldLabels = labelsIn.map((x) => (typeof x === "string" ? x : String(x ?? "")));
  const decimalPlaces = normalizeDecimalPlaces(o.decimalPlaces);

  // 旧模版无 columnRoles：有字段名 → field，空串 → blank
  if (!columnRoles.length && visualSource?.columns?.length && layoutMode === "horizontal") {
    for (const c of visualSource.columns) {
      columnRoles.push(String(c ?? "").trim() ? "field" : "blank");
    }
  }

  const out: TableSqlFillConfig = {
    enabled,
    fillMode,
    querySql,
    params,
    resultColumnNames,
    repeatHeaderOnPageBreak,
    splitReportsOnMaxRows,
    allowWidgetsBelowSqlFillTable,
    maxRows,
    visualSource,
    visualFilters,
    layoutMode,
    columnRoles,
    sequencePageMode,
    verticalMultiRecordMode,
    verticalFieldLabels,
    decimalPlaces,
  };
  ensureMinTableSqlParamSlots(out, Math.max(2, out.params.length));
  if (layoutMode === "vertical" && visualSource) ensureVerticalFieldLabels(out);
  return out;
}

/** 按 kind 收紧 defaults/bindings 长度（UI 切换类型时调用） */
export function normalizeVisualSqlFilterShape(f: VisualSqlFilter): void {
  const slots = f.kind === "equality" ? 1 : 2;
  while (f.defaults.length < slots) f.defaults.push("");
  f.defaults.length = slots;
  while (f.bindings.length < slots) f.bindings.push(defaultSqlParam());
  f.bindings.length = slots;
}

function clampColIndex(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(TEMPLATE_TABLE_MAX_COLS - 1, n));
}

/** 令结果列名数组长度与列数一致 */
export function ensureTableSqlResultColumnNames(fill: TableSqlFillConfig, colCount: number): void {
  const n = Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(colCount)) || 1));
  while (fill.resultColumnNames.length < n) fill.resultColumnNames.push("");
  fill.resultColumnNames.length = n;
}

/** visual 模式下输出列与表格物理列一一对齐（从左到右）；不足的补空串，多出的截断 */
export function ensureVisualOutputColumnSlots(fill: TableSqlFillConfig, colCount: number): void {
  if (!fill.visualSource) return;
  const n = isVerticalSqlFill(fill)
    ? Math.max(1, Math.min(TEMPLATE_TABLE_MAX_ROWS - 1, fill.visualSource.columns.length || 1))
    : Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(colCount)) || 1));
  const arr = fill.visualSource.columns;
  while (arr.length < n) arr.push(isVerticalSqlFill(fill) ? TABLE_SQL_VERTICAL_FIELD_PENDING : "");
  if (!isVerticalSqlFill(fill)) arr.length = n;
  ensureTableSqlColumnRoles(fill, n);
  if (isVerticalSqlFill(fill)) ensureVerticalFieldLabels(fill);
}

/** 画布第一行：可视化数据库填充时改为下拉选择输出字段（非手写 SQL；仅横表） */
export function isVisualSqlFillOutputPickerRow(
  el: { type?: string; tableSqlFill?: TableSqlFillConfig | null | undefined },
  rowIndex: number,
): boolean {
  return (
    rowIndex === 0 &&
    el.type === "table" &&
    !!(el.tableSqlFill?.enabled && el.tableSqlFill.fillMode === "visual") &&
    !isVerticalSqlFill(el.tableSqlFill)
  );
}

/**
 * 纵表画布：名称列（左列）下拉选择字段。
 * 行 0 为两列表头；行 1..N 对应 visualSource.columns 槽位（与首条记录展开对齐）。
 */
export function isVerticalSqlFillSlotPickerCell(
  el: { type?: string; tableSqlFill?: TableSqlFillConfig | null | undefined },
  rowIndex: number,
  colIndex: number,
): boolean {
  if (el.type !== "table" || colIndex !== 0 || rowIndex < 1) return false;
  const fill = el.tableSqlFill;
  if (!fill?.enabled || fill.fillMode !== "visual" || !isVerticalSqlFill(fill)) return false;
  const slots = fill.visualSource?.columns?.length ?? 0;
  return rowIndex - 1 < slots;
}

/** 纵表画布名称列下拉当前值 */
export function verticalSqlSlotPickValue(fill: TableSqlFillConfig, slotIndex: number): string {
  const raw = String(fill.visualSource?.columns?.[slotIndex] ?? "").trim();
  if (!raw) return TABLE_SQL_COLUMN_PICK_BLANK;
  return raw;
}

/** 画布列下拉当前值：序号哨兵 / 空白 / 字段名 */
export function visualSqlColumnPickValue(fill: TableSqlFillConfig, colIndex: number): string {
  if (isVerticalSqlFill(fill)) {
    return verticalSqlSlotPickValue(fill, colIndex);
  }
  ensureTableSqlColumnRoles(fill, fill.visualSource?.columns?.length || colIndex + 1);
  const role = fill.columnRoles?.[colIndex] ?? "field";
  if (role === "sequence") return TABLE_SQL_COLUMN_PICK_SEQUENCE;
  if (role === "blank") return TABLE_SQL_COLUMN_PICK_BLANK;
  return String(fill.visualSource?.columns?.[colIndex] ?? "");
}

/** 至少保留 minSlots 个参数槽（旧模板默认为 2） */
export function ensureMinTableSqlParamSlots(fill: TableSqlFillConfig, minSlots: number): void {
  const n = Math.max(0, Math.min(32, Math.floor(minSlots)));
  while (fill.params.length < n) fill.params.push(defaultSqlParam());
}

/** @deprecated 使用 ensureMinTableSqlParamSlots(fill, 2) */
export function ensureTwoTableSqlParamSlots(fill: TableSqlFillConfig): void {
  ensureMinTableSqlParamSlots(fill, Math.max(2, fill.params.length));
}

export function clampTableSqlMaxRows(n: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 2000;
  return Math.min(50000, Math.max(1, x));
}

/** 用表格第 0 行单元格文案写入结果列名（需在画布先把表头设在第一行） */
export function syncResultColumnNamesFromFirstRow(
  fill: TableSqlFillConfig,
  grid: { text?: string }[][],
  colCount: number,
): void {
  ensureTableSqlResultColumnNames(fill, colCount);
  const cols = Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(colCount)) || 1));
  const row0 = Array.isArray(grid[0]) ? grid[0] : [];
  for (let c = 0; c < cols; c++) {
    fill.resultColumnNames[c] = String(row0[c]?.text ?? "").trim();
  }
}

/** 将物理列名写入第一行单元格文案（仅文本，不改变绑定） */
export function syncFirstRowTextsFromColumnNames(grid: { text?: string }[][], names: string[]): void {
  if (!Array.isArray(grid[0])) return;
  const row0 = grid[0];
  const n = Math.min(row0.length, names.length);
  for (let c = 0; c < n; c++) row0[c].text = String(names[c] ?? "").trim();
}

/** 列数减少时收紧「同列上方」引用索引 */
export function clampSqlFillParamColumnRefs(fill: TableSqlFillConfig, colCount: number): void {
  const cols = Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(colCount)) || 1));
  const maxIdx = Math.max(0, cols - 1);
  for (const p of fill.params) {
    if (p.aboveCellColumnIndex > maxIdx) p.aboveCellColumnIndex = maxIdx;
  }
  for (const f of fill.visualFilters) {
    for (const p of f.bindings) {
      if (p.aboveCellColumnIndex > maxIdx) p.aboveCellColumnIndex = maxIdx;
    }
  }
}
