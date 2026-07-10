/**
 * 编辑器内「整表 SQL 填充」实时预览：执行 querySql、按结果同步表格行数、供画布/迷你页渲染。
 */

import {
  forEachTemplateCanvasElement,
  forEachZoneLayoutElement,
  formatScalarForPreviewValue,
} from "@/lib/report-template/binding-preview-utils";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { ensureZoneTableGrid } from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { clampTableElementOuterSize, ensureTableGrid } from "@/lib/report-template/model";
import type { TableSqlFillConfig, TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import {
  ensureTableSqlColumnRoles,
  isVerticalSqlFill,
  normalizeTableSqlSequencePageMode,
  normalizeTableSqlVerticalMultiRecordMode,
} from "@/lib/report-template/table-sql-fill";
import type { TableSqlFillPreviewPayload } from "@/lib/report-template/binding-preview-utils";
import { quoteSqlIdentifier } from "@/lib/report-template/table-sql-visual-compile";
import { sqlFillPreviewColCount } from "@/lib/report-template/table-sql-visual-compile";
import { buildVerticalSqlLogicalRows } from "@/lib/report-template/table-sql-vertical";
import { verticalSqlLogicalRowCount, verticalSqlSlotsPerRecord } from "@/lib/report-template/table-sql-vertical";

export function templateTableSqlFillPreviewKey(elId: string): string {
  return `tblfill:${elId}`;
}

export function zoneTableSqlFillPreviewKey(elId: string): string {
  return `ztblfill:${elId}`;
}

export interface TableSqlFillPreviewTask {
  key: string;
  connectionId: string;
  database?: string;
  /** 原始 SQL，可含 {{p0}}…/{{table}} 占位符；由运行方结合实际取值替换 */
  sql: string;
  /** 与 {{pN}} 对应的取值绑定（visual 编译或手写模式的 params） */
  params: TableSqlParamBinding[];
  /** 表名绑定 OPC 时的读取信息（{{table}} 占位符替换用） */
  tableOpc?: {
    nodeId: string;
    /** 标识符引用风格（mysql/mariadb 反引号；postgres/sqlite 双引号） */
    engine: string;
    /** OPC 读取失败或值非法时兜底的设计时表名（可为空） */
    fallbackTable: string;
  };
  limit: number;
  /** SELECT 结果列数（纵表）或物理列数（横表展开前用 fill 再映射） */
  colCount: number;
  /** 用于 blank/sequence 展开与纵表映射 */
  fill?: TableSqlFillConfig;
  /** 横表物理列数（blank/sequence 展开目标宽度） */
  tableCols?: number;
  expandRows: (dataRowCount: number) => void;
}

/** OPC 表名变量值 → 合法 SQL 标识符（非法时返回空串，由调用方走兜底） */
export function sanitizeOpcTableName(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) return "";
  return s;
}

/** 将 {{table}} 占位符替换为按引擎引用的表名 */
export function substituteSqlFillTableName(sql: string, engineLower: string, tableName: string): string {
  return sql.split("{{table}}").join(quoteSqlIdentifier(engineLower || "mysql", tableName));
}

/** 截断填充错误信息，用于画布预览 */
export function truncateSqlFillPreviewError(s: string, maxLen: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= maxLen ? x : `${x.slice(0, maxLen)}…`;
}

/**
 * 数据库整表填充开启时单元格展示文案：仅用 resultColumnNames + 预览数据行，不读取单元格静态 text（避免切换填充前后残留）。
 * 纵表：左列标签 / 右列值；横表：支持 blank / sequence 列角色。
 */
export function formatSqlFillTableCellPreview(opts: {
  fill: TableSqlFillConfig;
  rowIndex: number;
  colIndex: number;
  preview?: TableSqlFillPreviewPayload | null;
  /** 绑定预览任务加载中（且无有效结果/错误） */
  previewLoading?: boolean;
  errorMaxLen?: number;
  /** 导出预览分页：仅渲染数据行的子区间（用于跨页续表） */
  previewSlice?: {
    dataRowStart: number;
    dataRowCount: number;
    includeHeaderRow: boolean;
  };
}): string {
  const {
    fill,
    rowIndex: ri,
    colIndex: ci,
    preview: pv,
    previewLoading,
    errorMaxLen = 72,
    previewSlice: slice,
  } = opts;

  const headerAt = (c: number): string => {
    const name = String(fill.resultColumnNames?.[c] ?? "").trim();
    return name || "\u00a0";
  };

  if (previewLoading && !pv?.dataRows?.length && !pv?.error) {
    if (ri === 0) {
      const h = headerAt(ci);
      return h !== "\u00a0" ? h : "…";
    }
    return "…";
  }
  if (pv?.error) {
    if (ri === 0 && ci === 0) return `⟨填充⟩ ${truncateSqlFillPreviewError(pv.error, errorMaxLen)}`;
    return "\u00a0";
  }

  if (isVerticalSqlFill(fill)) {
    return formatVerticalSqlFillCell({ fill, ri, ci, pv, slice, headerAt });
  }
  return formatHorizontalSqlFillCell({ fill, ri, ci, pv, slice, headerAt });
}

function formatVerticalSqlFillCell(opts: {
  fill: TableSqlFillConfig;
  ri: number;
  ci: number;
  pv?: TableSqlFillPreviewPayload | null;
  slice?: { dataRowStart: number; dataRowCount: number; includeHeaderRow: boolean };
  headerAt: (c: number) => string;
}): string {
  const { fill, ri, ci, pv, slice, headerAt } = opts;
  // 编辑画布（无 slice）：「每条另起一页」只预览首条 SQL 结果，避免同表叠多条并出现续表分隔
  let dataRows = pv?.dataRows;
  if (
    !slice &&
    dataRows?.length &&
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record"
  ) {
    dataRows = [dataRows[0]];
  }
  const logical = buildVerticalSqlLogicalRows(fill, dataRows);
  if (slice) {
    const hdr = slice.includeHeaderRow;
    const sliceRows = (hdr ? 1 : 0) + slice.dataRowCount;
    if (ri < 0 || ri >= sliceRows) return "\u00a0";
    if (hdr && ri === 0) return headerAt(ci);
    const li = slice.dataRowStart + (ri - (hdr ? 1 : 0));
    const row = logical[li];
    if (!row) return "\u00a0";
    if (ci === 0) return row.label || "\u00a0";
    if (ci === 1) return row.value || "\u00a0";
    return "\u00a0";
  }
  if (logical.length) {
    if (ri === 0) return headerAt(ci);
    const row = logical[ri - 1];
    if (!row) return "\u00a0";
    if (ci === 0) return row.label || "\u00a0";
    if (ci === 1) return row.value || "\u00a0";
    return "\u00a0";
  }
  if (ri === 0) {
    const h = headerAt(ci);
    return h !== "\u00a0" ? h : "…";
  }
  return "…";
}

function formatHorizontalSqlFillCell(opts: {
  fill: TableSqlFillConfig;
  ri: number;
  ci: number;
  pv?: TableSqlFillPreviewPayload | null;
  slice?: { dataRowStart: number; dataRowCount: number; includeHeaderRow: boolean };
  headerAt: (c: number) => string;
}): string {
  const { fill, ri, ci, pv, slice, headerAt } = opts;
  const rolesLen = Math.max(ci + 1, fill.visualSource?.columns?.length || 0, fill.resultColumnNames?.length || 0);
  ensureTableSqlColumnRoles(fill, rolesLen);
  const role = fill.columnRoles?.[ci] ?? "field";

  const seqAt = (dataIndex: number, pageLocalIndex: number): string => {
    const mode = normalizeTableSqlSequencePageMode(fill.sequencePageMode);
    const n = mode === "restart_per_page" ? pageLocalIndex + 1 : dataIndex + 1;
    return String(n);
  };

  const cellAt = (dataIndex: number, pageLocalIndex: number): string => {
    if (role === "blank") return "\u00a0";
    if (role === "sequence") return seqAt(dataIndex, pageLocalIndex);
    const dr = pv?.dataRows?.[dataIndex];
    // dataRows 按物理列对齐（blank/sequence 位为空串）
    if (dr && ci < dr.length) {
      const v = dr[ci];
      return v === "" || v == null ? "\u00a0" : v;
    }
    return "\u00a0";
  };

  if (pv?.dataRows?.length && slice) {
    const hdr = slice.includeHeaderRow;
    const sliceRows = (hdr ? 1 : 0) + slice.dataRowCount;
    if (ri < 0 || ri >= sliceRows) return "\u00a0";
    if (hdr && ri === 0) return headerAt(ci);
    const local = ri - (hdr ? 1 : 0);
    const di = slice.dataRowStart + local;
    return cellAt(di, local);
  }
  if (pv?.dataRows?.length) {
    if (ri === 0) return headerAt(ci);
    return cellAt(ri - 1, ri - 1);
  }

  if (ri === 0) {
    const h = headerAt(ci);
    return h !== "\u00a0" ? h : "…";
  }
  return "…";
}

/** 与 backend `api/routers/database.py` 中 PREVIEW_LIMIT_MAX 一致 */
export const TABLE_SQL_FILL_PREVIEW_ROW_LIMIT = 1000;
export const TABLE_SQL_FILL_FULL_ROW_LIMIT = 50000;

/**
 * 单次填充查询的行数上限。
 * - 编辑器画布预览（fullSqlFill=false）：为响应速度截到 1000 行；
 * - 正式导出（fullSqlFill=true）：尊重用户配置的 maxRows（分报表模式取全量后再按 maxRows 切分）。
 *   注意不能沿用预览上限：否则「最大行数 > 1000 且未开分报表」的导出会被静默截断。
 */
export function sqlFillQueryLimit(fill: TableSqlFillConfig, fullSqlFill: boolean): number {
  const fillMaxRows = Math.min(Math.max(1, fill.maxRows || 2000), TABLE_SQL_FILL_FULL_ROW_LIMIT);
  if (!fullSqlFill) return Math.min(fillMaxRows, TABLE_SQL_FILL_PREVIEW_ROW_LIMIT);
  return fill.splitReportsOnMaxRows ? TABLE_SQL_FILL_FULL_ROW_LIMIT : fillMaxRows;
}

/** 画布/分页用的「显示数据行数」（纵表=逻辑行；横表=SQL 行） */
export function sqlFillDisplayDataRowCount(fill: TableSqlFillConfig, sqlDataRowCount: number): number {
  if (isVerticalSqlFill(fill)) return verticalSqlLogicalRowCount(fill, sqlDataRowCount);
  return Math.max(0, Math.floor(Number(sqlDataRowCount)) || 0);
}

/**
 * 编辑画布用的显示行数：纵表「每条另起一页」时只按首条 SQL 结果展开，
 * 避免同表叠多条并出现续表分隔（完整分页见导出预览）。
 */
export function sqlFillEditorDisplayDataRowCount(fill: TableSqlFillConfig, sqlDataRowCount: number): number {
  if (
    isVerticalSqlFill(fill) &&
    normalizeTableSqlVerticalMultiRecordMode(fill.verticalMultiRecordMode) === "page_per_record"
  ) {
    const n = Math.max(0, Math.floor(Number(sqlDataRowCount)) || 0);
    if (n <= 0) return 0;
    return verticalSqlSlotsPerRecord(fill);
  }
  return sqlFillDisplayDataRowCount(fill, sqlDataRowCount);
}

/**
 * 将正文表格行数同步为「表头 + 预览数据行」；查询结果变少时会缩小行数。
 */
export function syncTemplateTableRowsForSqlFillPreview(el: TemplateElement, dataRowCount: number): void {
  if (el.type !== "table") return;
  const headerRows = 1;
  const fill = el.tableSqlFill;
  let body: number;
  if (fill && isVerticalSqlFill(fill)) {
    const logical = sqlFillEditorDisplayDataRowCount(fill, dataRowCount);
    // 无预览数据时保留槽位行，便于画布「名称」列下拉与属性面板改行数
    const slotRows = Math.max(1, fill.visualSource?.columns?.length || 1);
    body = logical > 0 ? logical : slotRows;
  } else {
    body = Math.max(0, Math.floor(Number(dataRowCount)) || 0);
  }
  const nextRows = Math.min(30, headerRows + body);
  if (el.tableRows !== nextRows) {
    el.tableRows = nextRows;
    ensureTableGrid(el);
  }
  // 纵表：始终贴合外框（含行数未变但旧 h 偏矮的情况）
  if (fill && isVerticalSqlFill(fill)) {
    clampTableElementOuterSize(el);
  }
}

/**
 * 将版式区表格行数同步为「表头 + 预览数据行」；查询结果变少时会缩小行数。
 */
export function syncZoneTableRowsForSqlFillPreview(el: LayoutZoneElement, dataRowCount: number): void {
  if (el.type !== "table") return;
  const headerRows = 1;
  const fill = el.tableSqlFill;
  let body: number;
  if (fill && isVerticalSqlFill(fill)) {
    const logical = sqlFillEditorDisplayDataRowCount(fill, dataRowCount);
    const slotRows = Math.max(1, fill.visualSource?.columns?.length || 1);
    body = logical > 0 ? logical : slotRows;
  } else {
    body = Math.max(0, Math.floor(Number(dataRowCount)) || 0);
  }
  const nextRows = Math.min(30, headerRows + body);
  if (el.tableRows === nextRows) return;
  el.tableRows = nextRows;
  ensureZoneTableGrid(el);
}

function mapRawSqlRowsToMatrix(rows: unknown[], keys: string[], cc: number): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    const line: string[] = [];
    if (Array.isArray(row)) {
      for (let ci = 0; ci < cc; ci++) line.push(formatScalarForPreviewValue(row[ci]));
    } else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      if (keys.length >= cc) {
        for (let ci = 0; ci < cc; ci++) line.push(formatScalarForPreviewValue(o[keys[ci]]));
      } else {
        const vals = Object.values(o);
        for (let ci = 0; ci < cc; ci++) line.push(formatScalarForPreviewValue(vals[ci]));
      }
    } else {
      for (let ci = 0; ci < cc; ci++) line.push("");
    }
    while (line.length < cc) line.push("");
    out.push(line.slice(0, cc));
  }
  return out;
}

/** SELECT 字段行 → 物理列（blank/sequence 位填空串，序号在渲染层计算） */
export function expandHorizontalSelectRowToPhysical(
  selectRow: string[],
  fill: TableSqlFillConfig,
  colCount: number,
): string[] {
  ensureTableSqlColumnRoles(fill, colCount);
  const roles = fill.columnRoles || [];
  const vsCols = fill.visualSource?.columns || [];
  const line: string[] = [];
  let si = 0;
  for (let ci = 0; ci < colCount; ci++) {
    const role = roles[ci] ?? "field";
    if (role === "blank" || role === "sequence") {
      line.push("");
      continue;
    }
    const field = String(vsCols[ci] ?? "").trim();
    if (!field) {
      line.push("");
      continue;
    }
    line.push(si < selectRow.length ? selectRow[si] : "");
    si++;
  }
  return line;
}

/**
 * 将 /database/query/sql 响应转为预览矩阵。
 * - 纵表：按 SELECT 字段数对齐（空白分隔槽不在结果中）
 * - 横表：若有 blank/sequence，先按 SELECT 读入再展开到物理列
 */
export function sqlResponseToPreviewRows(
  data: unknown,
  colCount: number,
  fill?: TableSqlFillConfig | null,
): string[][] {
  if (!data || typeof data !== "object") return [];
  const d = data as { columns?: { name?: string }[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const colsMeta = Array.isArray(d.columns) ? d.columns : [];
  const keys = colsMeta.map((c) => String(c?.name ?? "").trim()).filter(Boolean);

  if (fill && isVerticalSqlFill(fill)) {
    const cc = Math.max(1, Math.min(30, Math.floor(colCount) || 1));
    return mapRawSqlRowsToMatrix(rows, keys, cc);
  }

  if (fill && !isVerticalSqlFill(fill) && fill.visualSource) {
    ensureTableSqlColumnRoles(fill, colCount);
    const roles = fill.columnRoles || [];
    const selectCount = roles.filter((r, i) => {
      if (r !== "field") return false;
      return String(fill.visualSource!.columns[i] ?? "").trim().length > 0;
    }).length;
    const selectRows = mapRawSqlRowsToMatrix(rows, keys, Math.max(1, selectCount || 1));
    const cc = Math.max(1, Math.min(30, Math.floor(colCount) || 1));
    return selectRows.map((sr) => expandHorizontalSelectRowToPhysical(sr, fill, cc));
  }

  const cc = Math.max(1, Math.min(30, Math.floor(colCount) || 1));
  return mapRawSqlRowsToMatrix(rows, keys, cc);
}

function buildSingleTableSqlFillTask(
  fill: TableSqlFillConfig | undefined,
  colCount: number,
  previewKey: string,
  fallbackSqlConnId: string | null,
  expandRows: (dataRowCount: number) => void,
  fullSqlFill = false,
): TableSqlFillPreviewTask | null {
  if (!fill?.enabled) return null;
  const sqlRaw = (fill.querySql || "").trim();
  if (!sqlRaw) return null;

  let connectionId = "";
  let database: string | undefined;
  if (fill.fillMode === "visual" && fill.visualSource?.connectionId?.trim()) {
    connectionId = fill.visualSource.connectionId.trim();
    database = fill.visualSource.database?.trim() || undefined;
  } else {
    connectionId = (fallbackSqlConnId || "").trim();
  }
  if (!connectionId) return null;

  const limit = sqlFillQueryLimit(fill, fullSqlFill);
  const cc = sqlFillPreviewColCount(fill, colCount);

  const vsrc = fill.fillMode === "visual" ? fill.visualSource : null;
  const tableOpcNodeId = String(vsrc?.tableOpcNodeId || "").trim();
  const tableOpc =
    vsrc && vsrc.tableSource === "opcua" && tableOpcNodeId && sqlRaw.includes("{{table}}")
      ? {
          nodeId: tableOpcNodeId,
          engine: (vsrc.engine || "mysql").toLowerCase(),
          fallbackTable: String(vsrc.table || "").trim(),
        }
      : undefined;

  return {
    key: previewKey,
    connectionId,
    database,
    sql: sqlRaw,
    params: Array.isArray(fill.params) ? fill.params : [],
    tableOpc,
    limit,
    colCount: cc,
    fill,
    tableCols: colCount,
    expandRows,
  };
}

export function buildTableSqlFillPreviewTasks(
  t: ReportTemplate,
  fallbackSqlConnId: string | null,
  opts?: { fullSqlFill?: boolean },
): TableSqlFillPreviewTask[] {
  const tasks: TableSqlFillPreviewTask[] = [];

  forEachTemplateCanvasElement(t, (el) => {
    if (el.type !== "table") return;
    const task = buildSingleTableSqlFillTask(
      el.tableSqlFill,
      el.tableCols ?? 4,
      templateTableSqlFillPreviewKey(el.id),
      fallbackSqlConnId,
      (n) => syncTemplateTableRowsForSqlFillPreview(el, n),
      opts?.fullSqlFill === true,
    );
    if (task) tasks.push(task);
  });

  forEachZoneLayoutElement(t, (el) => {
    if (el.type !== "table") return;
    const task = buildSingleTableSqlFillTask(
      el.tableSqlFill,
      el.tableCols ?? 4,
      zoneTableSqlFillPreviewKey(el.id),
      fallbackSqlConnId,
      (n) => syncZoneTableRowsForSqlFillPreview(el, n),
      opts?.fullSqlFill === true,
    );
    if (task) tasks.push(task);
  });

  return tasks;
}
