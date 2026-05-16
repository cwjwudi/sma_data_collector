/** 版式预设 API `/layout-presets` */

import type { LayoutPreset } from "@/lib/report-template/layout-model";

import { resolveApiHref } from "./apiBase.js";

function url(p: string) {
  const x = p.startsWith("/") ? p : `/${p}`;
  return resolveApiHref(x);
}

async function fj<T>(u: string, init?: RequestInit): Promise<T> {
  const r = await fetch(u, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers as object) },
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

export async function putLayoutPreset(id: string, body: LayoutPreset) {
  return fj<LayoutPreset>(url(`/layout-presets/${encodeURIComponent(id)}`), {
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
