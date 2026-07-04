/**
 * 应用启动后的后台预热（warm-up）。
 *
 * 目标：常用页不必「等你切到该页才开始加载」——在应用启动后、浏览器空闲时
 * 就先把这些页共享的内存缓存预取好，首次进入即可直接命中缓存。
 *
 * 约束：
 * - 只预取轻量 / 一次性数据（版式库快照、模板摘要），不做重渲染、不拉大图；
 * - 全部在 requestIdleCallback（不支持则 setTimeout）里错峰执行，避免拖慢启动；
 * - 失败一律静默（预热只是加速，失败不影响用户手动进入页面时的正常加载）；
 * - 只执行一次。
 */
import { listTemplateSummaries } from "@/api/templates";
import { ensureLayoutPresetsLoaded } from "@/lib/report-template/layout-registry";
import { ensureSignatureSummaries } from "@/lib/signature-registry";
import {
  getCachedTemplateFullMap,
  hasTemplateViewCache,
  saveTemplateViewCache,
} from "@/lib/report-template/template-view-cache";

let started = false;

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
};

function onIdle(fn: () => void, timeout = 2500): void {
  const ric = (globalThis as unknown as IdleWindow).requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout });
  else setTimeout(fn, Math.min(timeout, 1500));
}

/** 预热版式库：填充 layout-registry 内存快照，惠及版式页、模板管理缩略图、两个编辑器。 */
async function warmLayoutPresets(): Promise<void> {
  try {
    await ensureLayoutPresetsLoaded();
  } catch {
    /* 预热失败不影响后续手动加载 */
  }
}

/** 预热模板摘要：填充模板管理页跨导航缓存，使列表首屏可即时呈现。 */
async function warmTemplateSummaries(): Promise<void> {
  try {
    if (hasTemplateViewCache()) return; // 已有缓存则不覆盖用户既有状态
    const list = await listTemplateSummaries();
    saveTemplateViewCache(list, getCachedTemplateFullMap());
  } catch {
    /* ignore */
  }
}

/** 预热签名摘要：填充签名库会话缓存，使签名库页与模板编辑器签名下拉首屏即时呈现（图片仍按需懒加载）。 */
async function warmSignatureSummaries(): Promise<void> {
  try {
    await ensureSignatureSummaries();
  } catch {
    /* ignore */
  }
}

/**
 * 由 MainLayout 在应用启动后调用一次。多次调用无副作用（仅首次生效）。
 * 错峰安排：版式库最先（惠及最多页面），随后模板摘要、签名摘要。
 */
export function prefetchCoreCatalog(): void {
  if (started) return;
  started = true;
  onIdle(() => void warmLayoutPresets(), 2000);
  onIdle(() => void warmTemplateSummaries(), 3500);
  onIdle(() => void warmSignatureSummaries(), 5000);
}
