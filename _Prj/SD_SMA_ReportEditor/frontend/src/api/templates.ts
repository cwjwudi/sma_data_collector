/** 调用 FastAPI `/templates`（开发环境经 Vite 代理 `/api` → 后端根路径） */

import type { ReportTemplate } from "@/lib/report-template/model";

import { resolveApiHref } from "./apiBase.js";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return resolveApiHref(p);
}

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const { timeoutMs: _ignored, signal: userSignal, ...rest } = init ?? {};
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const onUserAbort = () => ctrl.abort();
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort();
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }
  try {
    const r = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(rest.headers as Record<string, string>),
      },
    });
    if (!r.ok) {
      let detail = `${r.status} ${r.statusText}`;
      try {
        const body = await r.json();
        if (body?.detail !== undefined) detail = String(body.detail);
      } catch {
        try {
          detail = await r.text();
        } catch {
          /* ignore */
        }
      }
      throw new Error(detail);
    }
    if (r.status === 204) return undefined as T;
    return r.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）。请确认后端已启动，或稍后重试。`);
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }
}

export interface TemplateSummary {
  id: string;
  name: string;
  updatedAt: string;
  paperKind: string;
  orientation: string;
  /** 046 批次/非批次：旧后端或旧 sidecar 可能缺省，缺省视为 batch */
  reportKind?: "batch" | "nonBatch";
  /** 仅 reportKind=nonBatch：目标文件夹绝对路径 */
  nonBatchOutputDir?: string;
}

export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  return fetchJson<TemplateSummary[]>(apiUrl("/templates"));
}

/** 列表项 + 完整模版数据 */
export async function listTemplatesFull(): Promise<ReportTemplate[]> {
  return fetchJson<ReportTemplate[]>(apiUrl("/templates/full"));
}

export async function importTemplatesBulk(items: ReportTemplate[]) {
  return fetchJson<{ imported: number }>(apiUrl("/templates/import-bulk"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function getTemplate(
  templateId: string,
  opts?: { timeoutMs?: number },
): Promise<ReportTemplate> {
  return fetchJson<ReportTemplate>(apiUrl(`/templates/${encodeURIComponent(templateId)}`), {
    timeoutMs: opts?.timeoutMs,
  });
}

export async function putTemplate(
  templateId: string,
  body: ReportTemplate,
  opts?: { skipAssetAudit?: boolean },
): Promise<ReportTemplate> {
  const q = opts?.skipAssetAudit ? "?skip_asset_audit=true" : "";
  return fetchJson<ReportTemplate>(apiUrl(`/templates/${encodeURIComponent(templateId)}${q}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await fetchJson(apiUrl(`/templates/${encodeURIComponent(templateId)}`), {
    method: "DELETE",
  });
}

export function isTemplatesApiLikelyUnreachable(err: unknown): boolean {
  return err instanceof TypeError && String(err.message).includes("fetch");
}
