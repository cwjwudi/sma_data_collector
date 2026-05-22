import { writeSavedOpcNodeValue } from "@/lib/opcua-write";
import type {
  ExportResultOpcFeedback,
  ExportResultOpcStatusKind,
} from "@/lib/report-generator-prefs";

export type { ExportResultOpcFeedback, ExportResultOpcStatusKind };

export type ExportResultWritePayload = {
  success: boolean;
  message?: string;
  filePath?: string;
  fileName?: string;
};

function truncateMessage(text: string, maxLen: number): string {
  const n = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : 200;
  const s = text.trim();
  if (s.length <= n) return s;
  return `${s.slice(0, Math.max(0, n - 1))}…`;
}

function buildPlcMessage(payload: ExportResultWritePayload): string {
  if (payload.success) {
    const name = (payload.fileName || "").trim();
    const path = (payload.filePath || "").trim();
    if (name && path) return truncateMessage(`OK: ${name}`, 500);
    if (path) return truncateMessage(`OK: ${path}`, 500);
    return "OK";
  }
  const err = (payload.message || "导出失败").split("\n")[0].trim() || "导出失败";
  return truncateMessage(err, 500);
}

export function isExportResultOpcFeedbackConfigured(fb: ExportResultOpcFeedback): boolean {
  if (!fb.enabled) return false;
  if (!fb.serverId.trim()) return false;
  return Boolean(
    fb.statusNodeId.trim() || fb.messageNodeId.trim() || fb.filePathNodeId.trim(),
  );
}

export async function writeExportResultToOpcua(
  feedback: ExportResultOpcFeedback,
  payload: ExportResultWritePayload,
): Promise<{ ok: boolean; errors: string[] }> {
  if (!isExportResultOpcFeedbackConfigured(feedback)) {
    return { ok: true, errors: [] };
  }

  const serverId = feedback.serverId.trim();
  const errors: string[] = [];
  const statusVal =
    feedback.statusKind === "int" ? (payload.success ? 1 : 0) : payload.success;
  const msgText = buildPlcMessage(payload);
  const pathText = payload.success ? (payload.filePath || "").trim() : "";

  if (feedback.statusNodeId.trim()) {
    const res = await writeSavedOpcNodeValue(serverId, feedback.statusNodeId, statusVal);
    if (!res.ok) errors.push(`状态节点：${res.message || "写入失败"}`);
  }
  if (feedback.messageNodeId.trim()) {
    const res = await writeSavedOpcNodeValue(
      serverId,
      feedback.messageNodeId,
      truncateMessage(msgText, feedback.messageMaxLen),
    );
    if (!res.ok) errors.push(`信息节点：${res.message || "写入失败"}`);
  }
  if (feedback.filePathNodeId.trim()) {
    const res = await writeSavedOpcNodeValue(
      serverId,
      feedback.filePathNodeId,
      truncateMessage(pathText, feedback.messageMaxLen),
    );
    if (!res.ok) errors.push(`路径节点：${res.message || "写入失败"}`);
  }

  return { ok: errors.length === 0, errors };
}
