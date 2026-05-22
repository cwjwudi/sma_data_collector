import { apiFetch } from "@/api/client.js";

export type AuditLogPayload = {
  action: string;
  result?: "ok" | "fail" | string;
  summary?: string;
  object_type?: string;
  object_id?: string;
  detail?: Record<string, unknown>;
};

/** 写入操作审计（失败静默，不阻断主流程）。 */
export async function auditLog(payload: AuditLogPayload): Promise<void> {
  const action = payload.action?.trim();
  if (!action) return;
  try {
    await apiFetch("/audit/log", {
      method: "POST",
      body: {
        action,
        result: payload.result || "ok",
        summary: payload.summary || "",
        object_type: payload.object_type,
        object_id: payload.object_id,
        detail: payload.detail || {},
      },
    });
  } catch (e) {
    console.warn("[auditLog]", e);
  }
}

export type AuditEntry = {
  id: string;
  ts: number;
  action: string;
  result: string;
  summary: string;
  object_type?: string | null;
  object_id?: string | null;
  detail?: Record<string, unknown>;
  actor?: { os_user?: string; hostname?: string };
};

export async function fetchAuditEntries(params: {
  limit?: number;
  offset?: number;
  action?: string;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.action?.trim()) q.set("action", params.action.trim());
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return (await apiFetch(`/audit/entries${suffix}`)) as { entries: AuditEntry[]; total: number };
}

export async function exportAuditJson(action?: string): Promise<{ entries: AuditEntry[]; total: number }> {
  const suffix = action?.trim() ? `?action=${encodeURIComponent(action.trim())}` : "";
  return (await apiFetch(`/audit/export${suffix}`)) as { entries: AuditEntry[]; total: number };
}

export function formatAuditTime(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return "—";
  }
}
