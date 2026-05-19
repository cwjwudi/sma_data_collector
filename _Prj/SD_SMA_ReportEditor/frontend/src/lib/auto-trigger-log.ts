import type { AutoOpcTriggerMode } from "@/lib/report-generator-prefs";

/** 单条自动导出触发记录 */
export type AutoTriggerLogEntry = {
  id: string;
  /** ISO 8601 */
  at: string;
  /** 触发事件说明（如上升沿、下降沿） */
  event: string;
  /** 生成 PDF 文件名（含 .pdf） */
  fileName: string;
  /** 完整保存路径（可选） */
  filePath?: string;
  success: boolean;
  message?: string;
};

export const AUTO_TRIGGER_LOG_MAX = 50;

/** 绑定卡片上仅展示最近条数 */
export const AUTO_TRIGGER_LOG_UI_MAX = 10;

export type TriggerHistoryLoggerMeta = {
  bindingLabel: string;
  bindingId: string;
  templateName?: string;
  nodeId?: string;
  serverLabel?: string;
  mode?: string;
  compareValue?: string;
};

export function triggerLogUiSlice(log: AutoTriggerLogEntry[] | undefined): AutoTriggerLogEntry[] {
  if (!log?.length) return [];
  return log.slice(0, AUTO_TRIGGER_LOG_UI_MAX);
}

export function newAutoTriggerLogEntryId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function autoTriggerEventLabel(mode: AutoOpcTriggerMode, compareValue?: string): string {
  if (mode === "equals") {
    const v = (compareValue ?? "").trim() || "—";
    return `值等于 ${v}`;
  }
  return mode === "falling" ? "下降沿触发" : "上升沿触发";
}

export function formatTriggerLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function normalizeTriggerLog(raw: unknown): AutoTriggerLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AutoTriggerLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const at = typeof o.at === "string" ? o.at : "";
    const event = typeof o.event === "string" ? o.event.trim() : "";
    const fileName = typeof o.fileName === "string" ? o.fileName.trim() : "";
    if (!at || !event) continue;
    out.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : newAutoTriggerLogEntryId(),
      at,
      event,
      fileName: fileName || "—",
      filePath: typeof o.filePath === "string" ? o.filePath : undefined,
      success: o.success === true,
      message: typeof o.message === "string" ? o.message : undefined,
    });
  }
  return out.slice(0, AUTO_TRIGGER_LOG_MAX);
}

export function appendTriggerLogEntry(
  log: AutoTriggerLogEntry[],
  entry: Omit<AutoTriggerLogEntry, "id"> & { id?: string },
): AutoTriggerLogEntry[] {
  const row: AutoTriggerLogEntry = {
    id: entry.id?.trim() || newAutoTriggerLogEntryId(),
    at: entry.at,
    event: entry.event,
    fileName: entry.fileName || "—",
    filePath: entry.filePath,
    success: entry.success,
    message: entry.message,
  };
  return [row, ...log].slice(0, AUTO_TRIGGER_LOG_MAX);
}

export function triggerLogsNewestFirst(log: AutoTriggerLogEntry[] | undefined): AutoTriggerLogEntry[] {
  if (!log?.length) return [];
  return [...log].sort((a, b) => b.at.localeCompare(a.at));
}

function escapeLoggerField(s: string): string {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

/** 生成 history logger 文本（完整记录，供导出） */
export function buildTriggerHistoryLoggerText(
  meta: TriggerHistoryLoggerMeta,
  log: AutoTriggerLogEntry[],
): string {
  const lines: string[] = [
    "# SD SMA Report Editor — Auto Export Trigger History Logger",
    `# exported_at: ${new Date().toISOString()}`,
    `# binding: ${meta.bindingLabel}`,
    `# binding_id: ${meta.bindingId}`,
  ];
  if (meta.templateName) lines.push(`# template: ${meta.templateName}`);
  if (meta.serverLabel) lines.push(`# opc_server: ${meta.serverLabel}`);
  if (meta.nodeId) lines.push(`# trigger_node: ${meta.nodeId}`);
  if (meta.mode) lines.push(`# trigger_mode: ${meta.mode}`);
  if (meta.compareValue != null && meta.compareValue !== "") {
    lines.push(`# compare_value: ${meta.compareValue}`);
  }
  lines.push(`# record_count: ${log.length}`);
  lines.push("");
  lines.push("time\tevent\tfile_name\tsuccess\tfile_path\tmessage");
  const ordered = triggerLogsNewestFirst(log);
  for (const row of ordered) {
    lines.push(
      [
        row.at,
        escapeLoggerField(row.event),
        escapeLoggerField(row.fileName),
        row.success ? "1" : "0",
        escapeLoggerField(row.filePath || ""),
        escapeLoggerField(row.message || ""),
      ].join("\t"),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function defaultTriggerHistoryLoggerFileName(bindingLabel: string): string {
  const safe = bindingLabel.replace(/[/\\?%*:|"<>]/g, "_").trim() || "binding";
  const ts = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  return `trigger-history_${safe}_${stamp}.log`;
}

/** 浏览器环境：下载文本文件 */
export function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
