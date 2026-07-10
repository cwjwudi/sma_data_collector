/**
 * 应用启动后的后台预热（warm-up）。
 *
 * 目标：常用页不必「等你切到该页才开始加载」——在应用启动后
 * 就先把这些页共享的内存缓存预取好，首次进入即可直接命中缓存。
 *
 * 流程（顺序执行，右下角弹窗实时显示当前步骤与进度）：
 * 1. 等待后端服务就绪（首启 PyInstaller 后端需要数秒，期间显示已等待秒数）；
 * 2. 版式库 → 模版摘要 → 签名摘要，逐项真实加载，失败自动重试；
 *    （缩略图完整 JSON 改由模版管理页按当前页渐进加载，避免模版很多时启动卡顿）
 * 3. 全部真正加载成功后才显示「已就绪」；失败则如实提示，不假装就绪。
 */
import { listTemplateSummaries } from "@/api/templates";
import { resolveApiHref } from "@/api/apiBase.js";
import {
  ensureLayoutPresetSummariesLoaded,
  isLayoutsOffline,
} from "@/lib/report-template/layout-registry";
import { ensureSignatureSummaries } from "@/lib/signature-registry";
import {
  getCachedTemplateFullMap,
  hasTemplateViewCache,
  saveTemplateViewCache,
} from "@/lib/report-template/template-view-cache";
import { showAppToast, dismissAppToast } from "@/composables/useAppToast";

let started = false;

const WARMUP_TOAST_ID = "startup-warmup";

/** 后端健康检查：最长等待时间与轮询间隔 */
const BACKEND_WAIT_MAX_MS = 120_000;
const BACKEND_POLL_MS = 800;
/** 每个数据步骤的重试次数与间隔 */
const STEP_RETRIES = 3;
const STEP_RETRY_DELAY_MS = 1200;

type WarmStep = { label: string; run: () => Promise<boolean> };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function showProgress(text: string): void {
  showAppToast(text, {
    id: WARMUP_TOAST_ID,
    tone: "info",
    durationMs: 0,
    spinner: true,
  });
}

export function dismissStartupWarmupToast(): void {
  dismissAppToast(WARMUP_TOAST_ID);
}

/** 探测一次后端 /health（短超时，失败返回 false） */
async function probeBackendOnce(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(resolveApiHref("/health"), {
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 等待后端服务就绪；期间在弹窗中显示已等待秒数，避免用户以为卡死。 */
async function waitBackendReady(): Promise<boolean> {
  const startAt = Date.now();
  for (;;) {
    if (await probeBackendOnce()) return true;
    const elapsed = Date.now() - startAt;
    if (elapsed >= BACKEND_WAIT_MAX_MS) return false;
    const secs = Math.round(elapsed / 1000);
    showProgress(
      secs >= 3
        ? `正在启动后端服务…（已等待 ${secs} 秒，首次启动稍慢属正常）`
        : "正在启动后端服务…",
    );
    await sleep(BACKEND_POLL_MS);
  }
}

/** 版式库：预热摘要列表（轻量）；完整版式在缩略图/编辑时再拉。 */
async function warmLayoutPresets(): Promise<boolean> {
  await ensureLayoutPresetSummariesLoaded();
  return !isLayoutsOffline();
}

/**
 * 模版：只预热摘要列表（轻量）。
 * 完整 JSON / 缩略图改由「模版管理」按当前页渐进加载，避免模版很多时启动与进页卡死。
 */
async function warmTemplates(): Promise<boolean> {
  if (hasTemplateViewCache()) return true;
  const summaries = await listTemplateSummaries();
  saveTemplateViewCache(summaries, getCachedTemplateFullMap());
  return true;
}

/** 签名摘要：后端已确认就绪，正常情况下一次即成功。 */
async function warmSignatureSummaries(): Promise<boolean> {
  await ensureSignatureSummaries();
  return true;
}

/** 执行单个步骤：失败自动重试若干次；最终返回是否成功。 */
async function runStepWithRetry(step: WarmStep): Promise<boolean> {
  for (let attempt = 1; attempt <= STEP_RETRIES; attempt++) {
    try {
      if (await step.run()) return true;
    } catch {
      /* fallthrough to retry */
    }
    if (attempt < STEP_RETRIES) await sleep(STEP_RETRY_DELAY_MS);
  }
  return false;
}

async function runWarmup(): Promise<void> {
  showProgress("正在启动后端服务…");

  const backendOk = await waitBackendReady();
  if (!backendOk) {
    showAppToast(
      "后端服务启动超时，页面数据暂未预加载。\n进入各页面时会自动重试；若持续失败请重启软件。",
      { id: WARMUP_TOAST_ID, tone: "warn", durationMs: 10000 },
    );
    return;
  }

  const steps: WarmStep[] = [
    { label: "版式", run: warmLayoutPresets },
    { label: "模版", run: warmTemplates },
    { label: "签名", run: warmSignatureSummaries },
  ];
  // 进度总数含「后端服务」一步
  const total = steps.length + 1;
  const failed: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    showProgress(`正在加载${step.label}…（${i + 1}/${total} 已完成）`);
    const ok = await runStepWithRetry(step);
    if (!ok) failed.push(step.label);
  }

  // 通知已打开的页面：预热数据已就绪，若此前因后端未启动而进入离线兜底可立即重载
  try {
    window.dispatchEvent(new CustomEvent("report-editor-warmup-complete"));
  } catch {
    /* ignore */
  }

  if (failed.length) {
    showAppToast(
      `部分数据未能预加载：${failed.join("、")}。\n进入相应页面时会自动重新加载。`,
      { id: WARMUP_TOAST_ID, tone: "warn", durationMs: 8000 },
    );
    return;
  }

  showAppToast("全部数据加载完成，各页面可秒开。", {
    id: WARMUP_TOAST_ID,
    tone: "ok",
    durationMs: 3000,
  });
}

/**
 * 由 MainLayout 在应用启动后调用一次。多次调用无副作用（仅首次生效）。
 * 顺序执行：等后端就绪 → 版式 → 模版 → 签名；全程右下角弹窗显示当前步骤，
 * 全部真正加载完成后才显示「已就绪」。
 */
export function prefetchCoreCatalog(): void {
  if (started) return;
  started = true;
  void runWarmup();
}
