/**
 * 导出取消 UI 接线（034 M7）：按钮 / toast 共用，避免散落 trim/空 jobId 判断。
 */

export type PdfExportCancelApi = {
  cancelPdfExport?: (opts: { jobId: string }) => Promise<unknown> | unknown;
};

export function shouldShowExportCancelControl(
  busy: boolean,
  jobId: string | null | undefined,
): boolean {
  return Boolean(busy && String(jobId || "").trim());
}

/** 发起取消；空 jobId 或无 API 时 no-op，返回是否已发起 */
export function requestCancelPdfExport(
  jobId: string | null | undefined,
  api?: PdfExportCancelApi | null,
): boolean {
  const id = String(jobId || "").trim();
  if (!id) return false;
  const cancel =
    api?.cancelPdfExport ??
    (typeof window !== "undefined" ? window.electronAPI?.cancelPdfExport : undefined);
  if (typeof cancel !== "function") return false;
  void cancel({ jobId: id });
  return true;
}

export function buildExportCancelToastAction(
  jobId: string | null | undefined,
  onCancel: () => void,
): { label: string; onClick: () => void } | undefined {
  if (!String(jobId || "").trim()) return undefined;
  return { label: "取消", onClick: onCancel };
}
