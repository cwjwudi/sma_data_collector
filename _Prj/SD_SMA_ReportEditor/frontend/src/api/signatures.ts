/** 签名库 `/signatures` */

import { resolveApiHref } from "./apiBase.js";

export interface SignatureAsset {
  id: string;
  label: string;
  imageSrc: string;
  updatedAt: string;
}

function u(p: string) {
  const x = p.startsWith("/") ? p : `/${p}`;
  return resolveApiHref(x);
}

async function fj<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(u(path), {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers as object) },
  });
  if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
  return r.json() as Promise<T>;
}

export async function listSignatures() {
  return fj<Pick<SignatureAsset, "id" | "label" | "updatedAt">[]>("/signatures");
}

export async function getSignature(id: string) {
  return fj<SignatureAsset>(`/signatures/${encodeURIComponent(id)}`);
}

export async function putSignature(id: string, body: SignatureAsset) {
  return fj<SignatureAsset>(`/signatures/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSignature(id: string) {
  const r = await fetch(u(`/signatures/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
  /** 部分网关可能返回空 body；有内容时再解析，避免误抛导致「已删但 UI 当失败」 */
  const text = await r.text().catch(() => "");
  if (text.trim()) {
    try {
      JSON.parse(text);
    } catch {
      /* 非 JSON 但 2xx：仍视为成功 */
    }
  }
}
