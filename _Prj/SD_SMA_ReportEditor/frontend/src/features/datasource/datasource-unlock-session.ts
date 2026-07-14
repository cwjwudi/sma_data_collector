/** 数据源限时解锁会话（应用级：切页不暂停，到期自动上锁）。 */

import { apiFetch } from "@/api/client.js";

export const UNLOCK_DURATION_MS = 60_000;
export const UNLOCK_SESSION_EVENT = "report-editor-datasource-unlock-session";

type SessionListener = () => void;

let unlockUntilMs = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let persistBusy = false;
const listeners = new Set<SessionListener>();

function now(): number {
  return Date.now();
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UNLOCK_SESSION_EVENT, {
        detail: {
          active: isUnlockSessionActive(),
          remainingMs: remainingMs(),
          retreatPct: retreatPct(),
        },
      }),
    );
  }
}

function stopTicker(): void {
  if (tickTimer != null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTicker(): void {
  if (tickTimer != null) return;
  tickTimer = setInterval(() => {
    notify();
    if (unlockUntilMs > 0 && remainingMs() <= 0) {
      void expireAndLock();
    }
  }, 100);
}

async function persistLocked(locked: boolean): Promise<void> {
  if (persistBusy) return;
  persistBusy = true;
  try {
    await apiFetch("/settings/app_preferences", {
      method: "PATCH",
      body: { datasource_locked: locked },
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("report-editor-datasource-lock-changed", { detail: { locked } }),
      );
    }
  } finally {
    persistBusy = false;
  }
}

async function expireAndLock(): Promise<void> {
  if (unlockUntilMs <= 0) return;
  unlockUntilMs = 0;
  stopTicker();
  notify();
  try {
    await persistLocked(true);
  } catch (e) {
    console.warn("[datasource-unlock-session] auto-lock failed", e);
  }
  notify();
}

export function isUnlockSessionActive(): boolean {
  return unlockUntilMs > 0 && remainingMs() > 0;
}

export function remainingMs(): number {
  if (unlockUntilMs <= 0) return 0;
  return Math.max(0, unlockUntilMs - now());
}

export function remainingSeconds(): number {
  return Math.ceil(remainingMs() / 1000);
}

/** 0=刚解锁（滑块在解锁端），100=到期（滑块回到锁定端） */
export function retreatPct(): number {
  if (unlockUntilMs <= 0) return 100;
  const left = remainingMs();
  if (left <= 0) return 100;
  return Math.min(100, Math.max(0, (1 - left / UNLOCK_DURATION_MS) * 100));
}

export function subscribeUnlockSession(fn: SessionListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 开始或重置 60s 解锁窗口，并确保 prefs 为未锁定。
 * AI pending 确认解锁与手动滑解锁共用。
 */
export async function beginUnlockSession(): Promise<void> {
  unlockUntilMs = now() + UNLOCK_DURATION_MS;
  startTicker();
  notify();
  try {
    await persistLocked(false);
  } catch (e) {
    console.warn("[datasource-unlock-session] unlock persist failed", e);
    throw e;
  }
  notify();
}

/** 立即上锁并取消倒计时（手动拖回锁定端）。 */
export async function lockDatasourceNow(): Promise<void> {
  unlockUntilMs = 0;
  stopTicker();
  notify();
  await persistLocked(true);
  notify();
}

/** 仅清会话不写库（例如外部已锁定）。 */
export function clearUnlockSessionLocal(): void {
  unlockUntilMs = 0;
  stopTicker();
  notify();
}

/** 测试用：推进/设定会话结束点 */
export function _testSetUnlockUntil(ms: number): void {
  unlockUntilMs = ms;
  if (ms > now()) startTicker();
  else stopTicker();
  notify();
}

export function _testGetUnlockUntil(): number {
  return unlockUntilMs;
}
