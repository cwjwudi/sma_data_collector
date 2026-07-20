/**
 * 导出/侧栏预览分卷报告列表（030）：导出指定 reportPartIndex 时只算当前份，避免 N 次 DOM 估高。
 */
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { ReportTemplate } from "@/lib/report-template/model";
import {
  computeExpandedBodyPreviewCards,
  type ExpandedBodyPreviewCard,
} from "@/lib/report-template/table-sql-fill-export-preview-split";
import {
  buildSqlFillSplitReportPlan,
  previewValuesForSplitReport,
} from "@/lib/report-template/table-sql-fill-report-split";

export type ExportPreviewValues = Record<string, BindingPreviewCell | undefined>;

export interface ExportPreviewReport {
  reportIndex: number;
  totalReports: number;
  previewValues: ExportPreviewValues;
  bodyCards: ExpandedBodyPreviewCard[];
}

function buildOne(
  tmpl: ReportTemplate,
  previewValues: ExportPreviewValues,
  reportIndex: number,
  totalReports: number,
): ExportPreviewReport {
  return {
    reportIndex,
    totalReports,
    previewValues,
    bodyCards: computeExpandedBodyPreviewCards(tmpl, previewValues),
  };
}

/**
 * @param reportPartIndex 导出传入具体份序号时只算该份；null/undefined 算全部（编辑器侧栏）
 */
export function buildExportPreviewReports(
  tmpl: ReportTemplate,
  previewBindingValues: ExportPreviewValues | null | undefined,
  reportPartIndex?: number | null,
): ExportPreviewReport[] {
  const base = (previewBindingValues ?? {}) as ExportPreviewValues;
  const plan = buildSqlFillSplitReportPlan(tmpl, base);
  if (!plan) {
    return [buildOne(tmpl, base, 0, 1)];
  }

  const want =
    reportPartIndex != null && Number.isFinite(reportPartIndex) ? Math.trunc(reportPartIndex) : null;

  if (want != null && want >= 0 && want < plan.reportCount) {
    const previewValues = previewValuesForSplitReport(base, plan, want);
    return [buildOne(tmpl, previewValues, want, plan.reportCount)];
  }

  return Array.from({ length: plan.reportCount }, (_x, idx) => {
    const previewValues = previewValuesForSplitReport(base, plan, idx);
    return buildOne(tmpl, previewValues, idx, plan.reportCount);
  });
}
