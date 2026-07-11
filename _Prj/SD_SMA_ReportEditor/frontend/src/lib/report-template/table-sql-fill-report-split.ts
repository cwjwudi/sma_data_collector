import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages } from "@/lib/report-template/model";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

export type SqlFillPreviewValues = Record<string, BindingPreviewCell | undefined>;

/** 单张分报表表的按 maxRows 切分结果 */
export interface SqlFillSplitTableChunks {
  key: string;
  chunks: string[][][];
}

/**
 * 多表分报表计划：各表按各自 maxRows 切片后，按「份序号」对齐。
 * 第 i 份报表取各表的 chunks[i]（某表份数不足时用空行集）。
 */
export interface SqlFillSplitReportPlan {
  tables: SqlFillSplitTableChunks[];
  reportCount: number;
}

export function enabledBodySqlFillTables(tmpl: ReportTemplate): TemplateElement[] {
  const out: TemplateElement[] = [];
  for (const page of ensureBodyPages(tmpl)) {
    for (const el of page) {
      if (el.type === "table" && el.tableSqlFill?.enabled) out.push(el);
    }
  }
  return out;
}

function clampMaxRows(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Math.min(50000, Math.max(1, Number.isFinite(n) ? n : 2000));
}

function chunkRows(rows: string[][], maxRows: number): string[][][] {
  const chunks: string[][][] = [];
  for (let i = 0; i < rows.length; i += maxRows) {
    chunks.push(rows.slice(i, i + maxRows));
  }
  return chunks;
}

/**
 * 构建分报表计划。支持多张表同时开启 splitReportsOnMaxRows：
 * 份数 = 各表切片数的最大值，同序号份内各表取对应切片。
 */
export function buildSqlFillSplitReportPlan(
  tmpl: ReportTemplate,
  previewValues: SqlFillPreviewValues | null | undefined,
): SqlFillSplitReportPlan | null {
  const fillTables = enabledBodySqlFillTables(tmpl);
  const splitTables = fillTables.filter((el) => el.tableSqlFill?.splitReportsOnMaxRows);
  if (!splitTables.length) return null;

  const tables: SqlFillSplitTableChunks[] = [];
  let reportCount = 0;

  for (const el of splitTables) {
    const key = templateTableSqlFillPreviewKey(el.id);
    const pv = previewValues?.[key]?.tableSqlFill;
    const rows = pv?.dataRows;
    if (!rows?.length || pv?.error) continue;

    const maxRows = clampMaxRows(el.tableSqlFill?.maxRows);
    if (rows.length <= maxRows) continue;

    const chunks = chunkRows(rows, maxRows);
    tables.push({ key, chunks });
    reportCount = Math.max(reportCount, chunks.length);
  }

  if (!tables.length || reportCount <= 1) return null;
  return { tables, reportCount };
}

export function previewValuesForSplitReport(
  base: SqlFillPreviewValues,
  plan: SqlFillSplitReportPlan,
  reportIndex: number,
): SqlFillPreviewValues {
  const next: SqlFillPreviewValues = { ...base };
  const idx = Math.max(0, reportIndex);

  for (const table of plan.tables) {
    const rows = table.chunks[idx] ?? [];
    const old = next[table.key];
    const colCount = rows[0]?.length ?? old?.tableSqlFill?.dataRows?.[0]?.length ?? 0;
    next[table.key] = {
      text: `${rows.length}x${colCount}`,
      tableSqlFill: { dataRows: rows },
    };
    if (old?.tableSqlFill?.error) next[table.key] = old;
  }
  return next;
}

export function splitReportCountForPreview(
  tmpl: ReportTemplate,
  previewValues: SqlFillPreviewValues | null | undefined,
): number {
  return buildSqlFillSplitReportPlan(tmpl, previewValues)?.reportCount ?? 1;
}
