import { apiFetch } from "@/api/client.js";
import { resolveApiHref } from "@/api/apiBase.js";

export type AuditLogPayload = {
  action: string;
  result?: "ok" | "fail" | string;
  summary?: string;
  object_type?: string;
  object_id?: string;
  detail?: Record<string, unknown>;
};

export type AuditQueryParams = {
  limit?: number;
  offset?: number;
  action?: string;
  result?: string;
  fromTs?: number;
  toTs?: number;
};

/** 写入操作审计（失败重试一次后静默，不阻断主流程）。 */
export async function auditLog(payload: AuditLogPayload): Promise<void> {
  const action = payload.action?.trim();
  if (!action) return;
  const body = {
    action,
    result: payload.result || "ok",
    summary: payload.summary || "",
    object_type: payload.object_type,
    object_id: payload.object_id,
    detail: payload.detail || {},
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await apiFetch("/audit/log", { method: "POST", body });
      return;
    } catch (e) {
      if (attempt === 0) {
        // 后端瞬时不可用（如刚启动）时补一次，避免结批记录静默丢失
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      console.warn("[auditLog]", e);
    }
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

function buildAuditQuery(params: AuditQueryParams): string {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.action?.trim()) q.set("action", params.action.trim());
  if (params.result?.trim()) q.set("result", params.result.trim());
  if (params.fromTs != null) q.set("from_ts", String(params.fromTs));
  if (params.toTs != null) q.set("to_ts", String(params.toTs));
  const suffix = q.toString();
  return suffix ? `?${suffix}` : "";
}

export async function fetchAuditEntries(
  params: AuditQueryParams,
): Promise<{ entries: AuditEntry[]; total: number }> {
  return (await apiFetch(`/audit/entries${buildAuditQuery(params)}`)) as {
    entries: AuditEntry[];
    total: number;
  };
}

export async function exportAuditJson(
  params: Omit<AuditQueryParams, "limit" | "offset"> = {},
): Promise<{ entries: AuditEntry[]; total: number }> {
  const q = buildAuditQuery({ ...params, limit: undefined, offset: undefined });
  return (await apiFetch(`/audit/export${q}`)) as { entries: AuditEntry[]; total: number };
}

export async function exportAuditCsv(params: Omit<AuditQueryParams, "limit" | "offset"> = {}): Promise<string> {
  const q = buildAuditQuery({ ...params, limit: undefined, offset: undefined });
  const url = resolveApiHref(`/audit/export.csv${q}`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `导出 CSV 失败 (${res.status})`);
  }
  return res.text();
}

export function formatAuditTime(ts: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

/** 将 date input (YYYY-MM-DD) 转为当天 0:00 的 unix 秒 */
export function dateInputToFromTs(value: string): number | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const d = new Date(`${v}T00:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/** 将 date input 转为当天 23:59:59 的 unix 秒 */
export function dateInputToToTs(value: string): number | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const d = new Date(`${v}T23:59:59`);
  const t = d.getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}
