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
import { showAppToast, dismissAppToast } from "@/composables/useAppToast";

let started = false;

/** 启动预热进度：右下角持久提示，逐项更新，全部就绪后短暂显示「已就绪」再消失。 */
const WARMUP_TOAST_ID = "startup-warmup";
const warmupState = { total: 3, done: 0, active: true };

function warmupTick(label: string): void {
  warmupState.done += 1;
  if (warmupState.done >= warmupState.total) {
    warmupState.active = false;
    showAppToast("页面数据已就绪，各页面可秒开。", {
      id: WARMUP_TOAST_ID,
      tone: "ok",
      durationMs: 2500,
    });
    return;
  }
  showAppToast(`正在后台预加载：${label} 已就绪（${warmupState.done}/${warmupState.total}）…`, {
    id: WARMUP_TOAST_ID,
    tone: "info",
    durationMs: 0,
    spinner: true,
  });
}

function warmupStart(): void {
  showAppToast("正在后台预加载模版、版式与签名，稍候各页面即可秒开…", {
    id: WARMUP_TOAST_ID,
    tone: "info",
    durationMs: 0,
    spinner: true,
  });
}

export function dismissStartupWarmupToast(): void {
  dismissAppToast(WARMUP_TOAST_ID);
}

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
  } finally {
    warmupTick("版式");
  }
}

/** 预热模板摘要：填充模板管理页跨导航缓存，使列表首屏可即时呈现。 */
async function warmTemplateSummaries(): Promise<void> {
  try {
    if (!hasTemplateViewCache()) {
      const list = await listTemplateSummaries();
      saveTemplateViewCache(list, getCachedTemplateFullMap());
    }
  } catch {
    /* ignore */
  } finally {
    warmupTick("模版");
  }
}

/** 预热签名摘要：填充签名库会话缓存，使签名库页与模板编辑器签名下拉首屏即时呈现（图片仍按需懒加载）。 */
async function warmSignatureSummaries(): Promise<void> {
  try {
    await ensureSignatureSummaries();
  } catch {
    /* ignore */
  } finally {
    warmupTick("签名");
  }
}

/**
 * 由 MainLayout 在应用启动后调用一次。多次调用无副作用（仅首次生效）。
 * 错峰安排：版式库最先（惠及最多页面），随后模板摘要、签名摘要。
 * 预热期间右下角显示进度提示，全部就绪后自动消失。
 */
export function prefetchCoreCatalog(): void {
  if (started) return;
  started = true;
  warmupStart();
  onIdle(() => void warmLayoutPresets(), 2000);
  onIdle(() => void warmTemplateSummaries(), 3500);
  onIdle(() => void warmSignatureSummaries(), 5000);
}
