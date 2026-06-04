import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages } from "@/lib/report-template/model";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

export type SqlFillPreviewValues = Record<string, BindingPreviewCell | undefined>;

export interface SqlFillSplitReportPlan {
  key: string;
  chunks: string[][][];
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

export function buildSqlFillSplitReportPlan(
  tmpl: ReportTemplate,
  previewValues: SqlFillPreviewValues | null | undefined,
): SqlFillSplitReportPlan | null {
  const fillTables = enabledBodySqlFillTables(tmpl);
  const splitTables = fillTables.filter((el) => el.tableSqlFill?.splitReportsOnMaxRows);
  if (fillTables.length !== 1 || splitTables.length !== 1) return null;

  const el = splitTables[0];
  const key = templateTableSqlFillPreviewKey(el.id);
  const pv = previewValues?.[key]?.tableSqlFill;
  const rows = pv?.dataRows;
  if (!rows?.length || pv.error) return null;

  const maxRowsRaw = Math.round(Number(el.tableSqlFill?.maxRows));
  const maxRows = Math.min(50000, Math.max(1, Number.isFinite(maxRowsRaw) ? maxRowsRaw : 2000));
  if (rows.length <= maxRows) return null;

  const chunks: string[][][] = [];
  for (let i = 0; i < rows.length; i += maxRows) {
    chunks.push(rows.slice(i, i + maxRows));
  }
  return { key, chunks };
}

export function previewValuesForSplitReport(
  base: SqlFillPreviewValues,
  plan: SqlFillSplitReportPlan,
  reportIndex: number,
): SqlFillPreviewValues {
  const rows = plan.chunks[reportIndex] ?? plan.chunks[0] ?? [];
  const next: SqlFillPreviewValues = { ...base };
  const old = next[plan.key];
  const colCount = rows[0]?.length ?? 0;
  next[plan.key] = {
    text: `${rows.length}x${colCount}`,
    tableSqlFill: { dataRows: rows },
  };
  if (old?.tableSqlFill?.error) next[plan.key] = old;
  return next;
}

export function splitReportCountForPreview(
  tmpl: ReportTemplate,
  previewValues: SqlFillPreviewValues | null | undefined,
): number {
  return buildSqlFillSplitReportPlan(tmpl, previewValues)?.chunks.length ?? 1;
}
