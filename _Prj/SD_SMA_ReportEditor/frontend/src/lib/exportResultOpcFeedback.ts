import { opcDataTypeLabelMatchesFilter } from "@/features/datasource/opcua/opcua-tree-utils.js";
import { readSavedOpcNodeValue } from "@/lib/opcua-string-variables";
import { probeOpcSavedConnection } from "@/features/datasource/connection-tab-health";
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
  filePaths?: string[];
  fileName?: string;
};

/** 写回 PLC「信息」节点时的导出场景（批次结束自动导出 vs 手动模拟截批） */
export type ExportResultWriteContext = "manual" | "auto";

/** 导出成功时写入 OPC String 的批次语义（与 UI「手动/自动导出」对应） */
export const EXPORT_RESULT_PLC_EVENT_LABEL: Record<ExportResultWriteContext, string> = {
  auto: "截批",
  manual: "模拟截批",
};

export type ExportResultBindingField = "status" | "message" | "path";

export type ExportResultValidationIssue = {
  field: ExportResultBindingField | "server";
  message: string;
};

function truncateMessage(text: string, maxLen: number): string {
  const n = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : 200;
  const s = text.trim();
  if (s.length <= n) return s;
  return `${s.slice(0, Math.max(0, n - 1))}…`;
}

/** 构建写回 PLC「信息」节点的字符串 */
export function buildExportResultPlcMessage(
  payload: ExportResultWritePayload,
  context?: ExportResultWriteContext,
): string {
  if (payload.success) {
    if (context === "manual" || context === "auto") {
      const label = EXPORT_RESULT_PLC_EVENT_LABEL[context];
      const msg = (payload.message || "").trim();
      const paths = Array.isArray(payload.filePaths) ? payload.filePaths.filter((x) => String(x || "").trim()) : [];
      const suffix = msg || (paths.length > 1 ? `共 ${paths.length} 份 PDF` : "");
      return truncateMessage(suffix ? `${label}；${suffix}` : label, 500);
    }
    const name = (payload.fileName || "").trim();
    const path = (payload.filePath || "").trim();
    if (name && path) return truncateMessage(`OK: ${name}`, 500);
    if (path) return truncateMessage(`OK: ${path}`, 500);
    return "OK";
  }
  const err = (payload.message || "导出失败").split("\n")[0].trim() || "导出失败";
  return truncateMessage(err, 500);
}

export function listConfiguredExportResultBindings(
  fb: ExportResultOpcFeedback,
): ExportResultBindingField[] {
  const out: ExportResultBindingField[] = [];
  if (fb.statusNodeId.trim()) out.push("status");
  if (fb.messageNodeId.trim()) out.push("message");
  if (fb.filePathNodeId.trim()) out.push("path");
  return out;
}

export function hasAnyExportResultBinding(fb: ExportResultOpcFeedback): boolean {
  return listConfiguredExportResultBindings(fb).length > 0;
}

/** 已绑定节点但缺少连接时给出可展示的错误 */
export function resolveExportResultOpcWriteContext(
  fb: ExportResultOpcFeedback,
): { ok: true; serverId: string } | { ok: false; message: string } {
  if (!fb.enabled) return { ok: false, message: "未启用截批结果反馈写回" };
  const configured = listConfiguredExportResultBindings(fb);
  if (!configured.length) return { ok: false, message: "未绑定任何反馈变量" };
  const serverId = fb.serverId.trim();
  if (!serverId) {
    return { ok: false, message: "已绑定反馈变量，但未选择 OPC UA 连接" };
  }
  return { ok: true, serverId };
}

export function isExportResultOpcFeedbackConfigured(fb: ExportResultOpcFeedback): boolean {
  return resolveExportResultOpcWriteContext(fb).ok;
}

function statusTypeFilter(kind: ExportResultOpcStatusKind): string {
  return kind === "int" ? "Int" : "Boolean";
}

const FIELD_LABEL: Record<ExportResultBindingField, string> = {
  status: "状态节点",
  message: "信息节点",
  path: "路径节点",
};

async function validateBoundNode(
  serverId: string,
  nodeId: string,
  field: ExportResultBindingField,
  fb: ExportResultOpcFeedback,
): Promise<ExportResultValidationIssue | null> {
  const read = await readSavedOpcNodeValue(serverId, nodeId);
  if (!read.ok) {
    return { field, message: `${FIELD_LABEL[field]}：${read.message || "读取失败"}` };
  }
  const dt = read.dataType || "";
  if (field === "status") {
    const expect = statusTypeFilter(fb.statusKind);
    if (dt && !opcDataTypeLabelMatchesFilter(dt, expect)) {
      return { field, message: `${FIELD_LABEL[field]}：需要 ${expect}，当前为 ${dt}` };
    }
  } else if (dt && !opcDataTypeLabelMatchesFilter(dt, "String")) {
    return { field, message: `${FIELD_LABEL[field]}：需要 String，当前为 ${dt}` };
  }
  return null;
}

/** 仅校验用户已绑定 NodeId 的项；不要求三节点齐全。 */
export async function validateExportResultOpcBindings(
  fb: ExportResultOpcFeedback,
): Promise<{ ok: boolean; issues: ExportResultValidationIssue[] }> {
  if (!fb.enabled) return { ok: true, issues: [] };
  const serverId = fb.serverId.trim();
  const issues: ExportResultValidationIssue[] = [];
  const configured = listConfiguredExportResultBindings(fb);
  if (!configured.length) {
    return { ok: true, issues: [] };
  }
  if (!serverId) {
    return { ok: false, issues: [{ field: "server", message: "未选择 OPC UA 连接" }] };
  }
  const conn = await probeOpcSavedConnection(serverId);
  if (!conn.ok) {
    issues.push({ field: "server", message: conn.message || "OPC UA 连接不可用" });
    return { ok: false, issues };
  }
  if (fb.statusNodeId.trim()) {
    const issue = await validateBoundNode(serverId, fb.statusNodeId, "status", fb);
    if (issue) issues.push(issue);
  }
  if (fb.messageNodeId.trim()) {
    const issue = await validateBoundNode(serverId, fb.messageNodeId, "message", fb);
    if (issue) issues.push(issue);
  }
  if (fb.filePathNodeId.trim()) {
    const issue = await validateBoundNode(serverId, fb.filePathNodeId, "path", fb);
    if (issue) issues.push(issue);
  }
  return { ok: issues.length === 0, issues };
}

export async function writeExportResultToOpcua(
  feedback: ExportResultOpcFeedback,
  payload: ExportResultWritePayload,
  context?: ExportResultWriteContext,
): Promise<{ ok: boolean; errors: string[]; skipped?: boolean; skipReason?: string }> {
  const writeCtx = resolveExportResultOpcWriteContext(feedback);
  if (!writeCtx.ok) {
    if (!feedback.enabled || !hasAnyExportResultBinding(feedback)) {
      return { ok: true, errors: [], skipped: true };
    }
    return { ok: false, errors: [writeCtx.message], skipped: true, skipReason: writeCtx.message };
  }

  const serverId = writeCtx.serverId;
  const errors: string[] = [];
  const statusVal =
    feedback.statusKind === "int" ? (payload.success ? 1 : 0) : payload.success;
  const msgText = buildExportResultPlcMessage(payload, context);
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

/** 向已绑定节点写入一次成功态测试值（不导出 PDF）。 */
export async function testWriteExportResultToOpcua(
  feedback: ExportResultOpcFeedback,
): Promise<{ ok: boolean; written: string[]; errors: string[] }> {
  const configured = listConfiguredExportResultBindings(feedback);
  if (!configured.length) {
    return { ok: false, written: [], errors: ["请至少绑定一个 OPC 变量"] };
  }
  if (!feedback.serverId.trim()) {
    return { ok: false, written: [], errors: ["未选择 OPC UA 连接"] };
  }
  const validation = await validateExportResultOpcBindings(feedback);
  if (!validation.ok) {
    return { ok: false, written: [], errors: validation.issues.map((i) => i.message) };
  }
  const testPayload: ExportResultWritePayload = {
    success: true,
    fileName: "测试导出.pdf",
    message: "测试写回（未执行真实导出）",
  };
  if (feedback.filePathNodeId.trim()) {
    testPayload.filePath = "";
  }
  const res = await writeExportResultToOpcua(feedback, testPayload, "manual");
  const written: string[] = [];
  if (feedback.statusNodeId.trim()) written.push(FIELD_LABEL.status);
  if (feedback.messageNodeId.trim()) written.push(FIELD_LABEL.message);
  if (feedback.filePathNodeId.trim()) written.push(FIELD_LABEL.path);
  return { ok: res.ok, written, errors: res.errors };
}
