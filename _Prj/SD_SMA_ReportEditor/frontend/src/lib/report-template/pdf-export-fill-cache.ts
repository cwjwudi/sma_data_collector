/**
 * 导出窗分卷取数缓存（030 / 023）：首份 fullSqlFill 后复用，后续 part 不再打全量 SQL。
 * 生命周期绑定同一隐藏导出窗 SPA；prewarm / 模版变更时清空。
 */
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { BindingPreviewStats } from "@/lib/report-template/template-editor-context";

export type PdfExportFillSnapshot = {
  templateId: string;
  values: Record<string, BindingPreviewCell>;
  totalReports: number;
  stats: BindingPreviewStats | null;
};

let cache: PdfExportFillSnapshot | null = null;

export function clearPdfExportFillCache(): void {
  cache = null;
}

export function peekPdfExportFillCache(): PdfExportFillSnapshot | null {
  return cache;
}

export function getPdfExportFillCache(templateId: string): PdfExportFillSnapshot | null {
  const id = String(templateId || "").trim();
  if (!id || !cache || cache.templateId !== id) return null;
  return cache;
}

export function setPdfExportFillCache(snap: PdfExportFillSnapshot): void {
  const id = String(snap.templateId || "").trim();
  if (!id) {
    cache = null;
    return;
  }
  cache = {
    templateId: id,
    values: snap.values,
    totalReports: Math.max(1, Math.floor(Number(snap.totalReports) || 1)),
    stats: snap.stats,
  };
}

/** partIndex>0 且缓存命中同模版 → 跳过 fullSqlFill */
export function shouldReusePdfExportFill(opts: {
  templateId: string;
  reportPartIndex: number | null | undefined;
  cache?: PdfExportFillSnapshot | null;
}): boolean {
  const id = String(opts.templateId || "").trim();
  const part = opts.reportPartIndex;
  if (!id || part == null || !Number.isFinite(part) || Math.trunc(part) <= 0) return false;
  const snap = opts.cache === undefined ? getPdfExportFillCache(id) : opts.cache;
  return Boolean(snap && snap.templateId === id);
}
