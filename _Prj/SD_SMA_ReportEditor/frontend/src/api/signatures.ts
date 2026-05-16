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
  await fj(`/signatures/${encodeURIComponent(id)}`, { method: "DELETE" });
}
