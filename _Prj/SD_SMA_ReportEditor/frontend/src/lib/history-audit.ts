/** 历史报表分屏：可移动卷 / 拷移操作审计摘要（027）。 */

import type { AuditLogPayload } from "@/lib/auditLog";
import { summarizeTransferResult } from "@/lib/history-selection";

export type HistoryTransferDirection = "left_to_right" | "right_to_left";

export function historyTransferDirection(from: "left" | "right"): HistoryTransferDirection {
  return from === "left" ? "left_to_right" : "right_to_left";
}

export function directionLabelZh(dir: HistoryTransferDirection): string {
  return dir === "left_to_right" ? "左→右" : "右→左";
}

export function buildRemovableOpenAudit(vol: {
  path: string;
  label?: string;
  platform?: string;
}): AuditLogPayload {
  const path = String(vol.path || "").trim();
  const label = String(vol.label || "").trim();
  const platform = String(vol.platform || "").trim();
  const name = label || path || "可移动存储";
  return {
    action: "history.removable_open",
    result: "ok",
    summary: `历史报表：打开可移动存储到右侧「${name}」`,
    object_type: "history_removable",
    object_id: path || undefined,
    detail: { path, label, platform },
  };
}

export function buildRemovableDismissAudit(vol: {
  path: string;
  label?: string;
  platform?: string;
}): AuditLogPayload {
  const path = String(vol.path || "").trim();
  const label = String(vol.label || "").trim();
  const platform = String(vol.platform || "").trim();
  const name = label || path || "可移动存储";
  return {
    action: "history.removable_dismiss",
    result: "ok",
    summary: `历史报表：忽略可移动存储提示「${name}」`,
    object_type: "history_removable",
    object_id: path || undefined,
    detail: { path, label, platform },
  };
}

export function buildSelectRightRootAudit(path: string): AuditLogPayload {
  const p = String(path || "").trim();
  return {
    action: "history.select_right_root",
    result: "ok",
    summary: `历史报表：选择右侧目录「${p || "—"}」`,
    object_type: "history_path",
    object_id: p || undefined,
    detail: { path: p },
  };
}

export function buildHistoryTransferAudit(opts: {
  mode: "copy" | "move";
  from: "left" | "right";
  sourceRoot: string;
  destRoot: string;
  destDir: string;
  conflict?: "skip" | "overwrite" | "rename";
  sourceCount: number;
  res: {
    ok?: boolean;
    copied?: number;
    moved?: number;
    skipped?: number;
    failed?: number;
    error?: string;
    results?: Array<{ status: string; error?: string; source?: string }>;
  };
}): AuditLogPayload {
  const dir = historyTransferDirection(opts.from);
  const action = opts.mode === "copy" ? "history.copy" : "history.move";
  const failed = opts.res.failed ?? 0;
  const result = failed > 0 || opts.res.ok === false ? "fail" : "ok";
  const verb = opts.mode === "copy" ? "复制" : "移动";
  const conflictZh =
    opts.conflict === "overwrite"
      ? "覆盖"
      : opts.conflict === "rename"
        ? "改名"
        : opts.conflict === "skip"
          ? "跳过"
          : "无冲突策略";
  const counts = summarizeTransferResult(opts.res);
  const summary = `历史报表：${verb}到对侧（${directionLabelZh(dir)}）· 选中 ${opts.sourceCount} · 冲突=${conflictZh} · ${counts}`;
  const failSamples = (opts.res.results || [])
    .filter((r) => r.status === "failed")
    .slice(0, 5)
    .map((r) => ({ source: r.source || "", error: r.error || "" }));
  return {
    action,
    result,
    summary,
    object_type: "history_transfer",
    object_id: opts.destDir || undefined,
    detail: {
      mode: opts.mode,
      direction: dir,
      sourceRoot: opts.sourceRoot,
      destRoot: opts.destRoot,
      destDir: opts.destDir,
      conflict: opts.conflict || "",
      sourceCount: opts.sourceCount,
      copied: opts.res.copied ?? 0,
      moved: opts.res.moved ?? 0,
      skipped: opts.res.skipped ?? 0,
      failed,
      error: opts.res.error || "",
      failSamples,
    },
  };
}
