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
import { ensureTableGrid } from "@/lib/report-template/model";
import type { TableSqlFillConfig, TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import type { TableSqlFillPreviewPayload } from "@/lib/report-template/binding-preview-utils";

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
  /** 原始 SQL，可含 {{p0}}… 占位符；由运行方结合 params 实际取值（OPC/批次号/手写）替换 */
  sql: string;
  /** 与 {{pN}} 对应的取值绑定（visual 编译或手写模式的 params） */
  params: TableSqlParamBinding[];
  limit: number;
  colCount: number;
  expandRows: (dataRowCount: number) => void;
}

/** 截断填充错误信息，用于画布预览 */
export function truncateSqlFillPreviewError(s: string, maxLen: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= maxLen ? x : `${x.slice(0, maxLen)}…`;
}

/**
 * 数据库整表填充开启时单元格展示文案：仅用 resultColumnNames + 预览数据行，不读取单元格静态 text（避免切换填充前后残留）。
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
  if (pv?.dataRows?.length && slice) {
    const hdr = slice.includeHeaderRow;
    const sliceRows = (hdr ? 1 : 0) + slice.dataRowCount;
    if (ri < 0 || ri >= sliceRows) return "\u00a0";
    if (hdr && ri === 0) return headerAt(ci);
    const di = slice.dataRowStart + (ri - (hdr ? 1 : 0));
    const dr = pv.dataRows[di];
    if (dr && ci < dr.length) return dr[ci];
    return "\u00a0";
  }
  if (pv?.dataRows?.length) {
    if (ri === 0) return headerAt(ci);
    const dr = pv.dataRows[ri - 1];
    if (dr && ci < dr.length) return dr[ci];
    return "\u00a0";
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

/**
 * 将正文表格行数同步为「表头 + 预览数据行」；查询结果变少时会缩小行数。
 */
export function syncTemplateTableRowsForSqlFillPreview(el: TemplateElement, dataRowCount: number): void {
  if (el.type !== "table") return;
  const headerRows = 1;
  const dr = Math.max(0, Math.floor(Number(dataRowCount)) || 0);
  el.tableRows = headerRows + dr;
  ensureTableGrid(el);
}

/**
 * 将版式区表格行数同步为「表头 + 预览数据行」；查询结果变少时会缩小行数。
 */
export function syncZoneTableRowsForSqlFillPreview(el: LayoutZoneElement, dataRowCount: number): void {
  if (el.type !== "table") return;
  const headerRows = 1;
  const dr = Math.max(0, Math.floor(Number(dataRowCount)) || 0);
  el.tableRows = headerRows + dr;
  ensureZoneTableGrid(el);
}

/** 将 /database/query/sql 响应转为与表格列数对齐的字符串矩阵（数据行）。 */
export function sqlResponseToPreviewRows(data: unknown, colCount: number): string[][] {
  if (!data || typeof data !== "object") return [];
  const d = data as { columns?: { name?: string }[]; rows?: unknown[] };
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const colsMeta = Array.isArray(d.columns) ? d.columns : [];
  const keys = colsMeta.map((c) => String(c?.name ?? "").trim()).filter(Boolean);
  const cc = Math.max(1, Math.min(30, Math.floor(colCount) || 1));

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
  const cc = Math.max(1, Math.min(30, Math.floor(colCount) || 1));

  return {
    key: previewKey,
    connectionId,
    database,
    sql: sqlRaw,
    params: Array.isArray(fill.params) ? fill.params : [],
    limit,
    colCount: cc,
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
