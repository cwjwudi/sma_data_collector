/** 调用 FastAPI `/templates`（开发环境经 Vite 代理 `/api` → 后端根路径） */

import type { ReportTemplate } from "@/lib/report-template/model";

import { resolveApiHref } from "./apiBase.js";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return resolveApiHref(p);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
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
}

export interface TemplateSummary {
  id: string;
  name: string;
  updatedAt: string;
  paperKind: string;
  orientation: string;
}

export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  return fetchJson<TemplateSummary[]>(apiUrl("/templates"));
}

export async function getTemplate(templateId: string): Promise<ReportTemplate> {
  return fetchJson<ReportTemplate>(apiUrl(`/templates/${encodeURIComponent(templateId)}`));
}

export async function putTemplate(templateId: string, body: ReportTemplate): Promise<ReportTemplate> {
  return fetchJson<ReportTemplate>(apiUrl(`/templates/${encodeURIComponent(templateId)}`), {
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
