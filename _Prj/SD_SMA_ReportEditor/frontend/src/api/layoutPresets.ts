/** 版式预设 API `/layout-presets` */

import type { LayoutPreset } from "@/lib/report-template/layout-model";

import { resolveApiHref } from "./apiBase.js";

function url(p: string) {
  const x = p.startsWith("/") ? p : `/${p}`;
  return resolveApiHref(x);
}

async function fj<T>(u: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 30_000;
  const { timeoutMs: _ignored, signal: userSignal, ...rest } = init ?? {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onUserAbort = () => ctrl.abort();
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort();
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }
  try {
    const r = await fetch(u, {
      ...rest,
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(rest.headers as object) },
    });
    if (!r.ok) {
      let detail = `${r.status}`;
      try {
        const b = await r.json();
        if (b?.detail !== undefined) detail = String(b.detail);
      } catch {
        detail = await r.text();
      }
      throw new Error(detail);
    }
    return r.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }
}

export async function listLayoutPresetSummaries() {
  return fj<unknown[]>(url("/layout-presets"));
}

/** 列表项 + 控件完整数据 */
export async function listLayoutPresetsFull(): Promise<LayoutPreset[]> {
  return fj<LayoutPreset[]>(url("/layout-presets/full"));
}

export async function getLayoutPreset(id: string) {
  return fj<LayoutPreset>(url(`/layout-presets/${encodeURIComponent(id)}`));
}

export async function putLayoutPreset(
  id: string,
  body: LayoutPreset,
  opts?: { skipAssetAudit?: boolean },
) {
  const q = opts?.skipAssetAudit ? "?skip_asset_audit=true" : "";
  return fj<LayoutPreset>(url(`/layout-presets/${encodeURIComponent(id)}${q}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteLayoutPreset(id: string) {
  await fj(url(`/layout-presets/${encodeURIComponent(id)}`), { method: "DELETE" });
}

export async function importLayoutsBulk(items: LayoutPreset[]) {
  return fj<{ imported: number }>(url("/layout-presets/import-bulk"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}
