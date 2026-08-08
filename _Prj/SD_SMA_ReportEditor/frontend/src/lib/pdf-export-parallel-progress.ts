/**
 * 分卷并行进度文案（遮罩 / toast / 侧栏共用）。
 * 任一导出档位只要并行≥2，就按 worker 分路描述，不限「不妥协」。
 */

export type PdfExportProgressWorker = {
  workerSlot?: number;
  partIndex?: number;
  stage?: string;
  stageLabel?: string;
  busy?: boolean;
};

export type PdfExportProgressLike = {
  phase?: string;
  partIndex?: number;
  totalReports?: number;
  completedParts?: number;
  workers?: PdfExportProgressWorker[];
  parallelWorkers?: number;
};

/** 并行≥2 时返回分路文案；否则 null（调用方走单路「第 x/共 y」）。 */
export function formatPdfExportParallelProgressDetail(
  p: PdfExportProgressLike,
  opts?: { prefixRender?: string; prefixSaved?: string },
): string | null {
  const workers = Array.isArray(p.workers) ? p.workers : [];
  const total = Math.max(0, Math.floor(Number(p.totalReports) || 0));
  if (workers.length <= 1 || total <= 0) return null;

  const doneRaw = Number(p.completedParts);
  const done = Number.isFinite(doneRaw) && doneRaw >= 0 ? Math.floor(doneRaw) : 0;
  const lanes = workers
    .map((w, i) => {
      const n = i + 1;
      if (!w?.busy) return `并行${n}空闲`;
      const idx = Math.min(total, Math.max(1, Math.floor(Number(w.partIndex) || 0) + 1));
      const st = String(w.stageLabel || "").trim();
      return st ? `并行${n}第${idx}份·${st}` : `并行${n}第${idx}份`;
    })
    .join("；");

  const phase = String(p.phase || "");
  const head =
    phase === "saved"
      ? opts?.prefixSaved || "分卷并行保存中"
      : opts?.prefixRender || "分卷并行渲染中";
  return `${head}（已完成 ${done}/${total}）\n${lanes}`;
}
