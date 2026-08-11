/**
 * PDF 导出 jobId + 失败/取消时清 fill-cache（032 P1-D）
 */
import { clearPdfExportFillCache } from "@/lib/report-template/pdf-export-fill-cache";

export function newPdfExportJobId(prefix = "pdf-export"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isPdfExportCancelledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /导出已取消|cancelled/i.test(msg);
}

/** 导出失败或取消后清本窗 + 全局 bridge，避免僵尸 fill 状态 */
export function clearPdfExportFillCacheAfterFailure(err?: unknown): void {
  void err;
  clearPdfExportFillCache({ bridge: true });
}
