/**
 * 签名库会话缓存：摘要列表 + 按需图片（data URL），供「签名库」页与模板编辑器复用。
 *
 * 背景：签名接口分为轻量摘要 `GET /signatures`（无图）与单条 `GET /signatures/:id`（含图）。
 * 原先签名库页一进入就对每条签名逐个拉图（N+1）。这里：
 * - 摘要做会话内存缓存（可被启动预热提前填充）；
 * - 图片按需拉取并缓存，带并发去重；页面可只对「可见行」拉图（懒加载）。
 *
 * 所有增删改后请调用 `invalidateSignature()` 使缓存失效。
 */
import * as api from "@/api/signatures";
import type { SignatureAsset } from "@/api/signatures";

export type SignatureSummary = Pick<SignatureAsset, "id" | "label" | "updatedAt">;

let summaries: SignatureSummary[] | null = null;
let summariesOffline = false;
const imageCache = new Map<string, string>();
const imageInflight = new Map<string, Promise<string | undefined>>();

/** 已成功加载过摘要则复用；离线兜底不复用（下次自动重试）。 */
export async function ensureSignatureSummaries(): Promise<SignatureSummary[]> {
  if (summaries && !summariesOffline) return summaries;
  try {
    summaries = await api.listSignatures();
    summariesOffline = false;
  } catch {
    summariesOffline = true;
    if (!summaries) summaries = [];
  }
  return summaries;
}

/** 强制重新拉取摘要（用于增删改后）。 */
export async function refreshSignatureSummaries(): Promise<SignatureSummary[]> {
  summaries = null;
  summariesOffline = false;
  return ensureSignatureSummaries();
}

/** 同步取已缓存图片（不触发请求），用于首屏直接回填已缓存项。 */
export function peekSignatureImage(id: string): string | undefined {
  return imageCache.get(id);
}

/** 取签名图片（含内存缓存 + 并发去重）；失败返回 undefined。 */
export async function getSignatureImage(id: string): Promise<string | undefined> {
  const cached = imageCache.get(id);
  if (cached !== undefined) return cached;
  const inflight = imageInflight.get(id);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const full = await api.getSignature(id);
      imageCache.set(id, full.imageSrc);
      return full.imageSrc;
    } catch {
      return undefined;
    } finally {
      imageInflight.delete(id);
    }
  })();
  imageInflight.set(id, p);
  return p;
}

/** 主动写入图片缓存（如刚手写保存的新条目，避免再次请求）。 */
export function primeSignatureImage(id: string, imageSrc: string): void {
  if (id && typeof imageSrc === "string") imageCache.set(id, imageSrc);
}

/** 增删改后使缓存失效：清摘要；给定 id 时清该图，否则清全部图。 */
export function invalidateSignature(id?: string): void {
  summaries = null;
  summariesOffline = false;
  if (id) imageCache.delete(id);
  else imageCache.clear();
}
