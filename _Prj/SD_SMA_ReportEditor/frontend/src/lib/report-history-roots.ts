/**
 * 046 Q7B：历史报表多根聚合——全局导出根 + 各非批次模版目标文件夹。
 * 左侧浏览根可在这些目录间切换；扫描仍按单根沙箱（resolveExportCwd）执行。
 */
import type { TemplateSummary } from "@/api/templates";

export type HistoryRootOption = {
  path: string;
  label: string;
  kind: "global" | "nonBatch";
};

export function normalizeRootKey(p: string): string {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function buildHistoryRootOptions(
  watchDir: string | null | undefined,
  summaries: Pick<TemplateSummary, "name" | "reportKind" | "nonBatchOutputDir">[],
): HistoryRootOption[] {
  const out: HistoryRootOption[] = [];
  const seen = new Set<string>();
  const global = String(watchDir || "").trim();
  if (global) {
    out.push({ path: global, label: `导出根目录 · ${global}`, kind: "global" });
    seen.add(normalizeRootKey(global));
  }
  for (const s of summaries) {
    if (s.reportKind !== "nonBatch") continue;
    const dir = String(s.nonBatchOutputDir || "").trim();
    if (!dir) continue;
    const key = normalizeRootKey(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path: dir, label: `非批次 · ${s.name || "未命名模版"} · ${dir}`, kind: "nonBatch" });
  }
  return out;
}
