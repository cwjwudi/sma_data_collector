import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.js", () => ({
  apiFetch: vi.fn(async () => ({})),
}));

import { apiFetch } from "@/api/client.js";
import {
  UNLOCK_DURATION_MS,
  beginUnlockSession,
  clearUnlockSessionLocal,
  isUnlockSessionActive,
  lockDatasourceNow,
  remainingMs,
  remainingSeconds,
  retreatPct,
  _testGetUnlockUntil,
  _testSetUnlockUntil,
} from "./datasource-unlock-session";

describe("datasource-unlock-session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    clearUnlockSessionLocal();
    vi.mocked(apiFetch).mockClear();
  });

  afterEach(() => {
    clearUnlockSessionLocal();
    vi.useRealTimers();
  });

  it("beginUnlockSession starts ~60s window and unlocks prefs", async () => {
    await beginUnlockSession();
    expect(isUnlockSessionActive()).toBe(true);
    expect(remainingMs()).toBe(UNLOCK_DURATION_MS);
    expect(remainingSeconds()).toBe(60);
    expect(retreatPct()).toBeCloseTo(0, 0);
    expect(apiFetch).toHaveBeenCalledWith(
      "/settings/app_preferences",
      expect.objectContaining({
        method: "PATCH",
        body: { datasource_locked: false },
      }),
    );
  });

  it("retreatPct advances toward 100 over time", async () => {
    await beginUnlockSession();
    vi.advanceTimersByTime(UNLOCK_DURATION_MS / 2);
    expect(retreatPct()).toBeCloseTo(50, 0);
    expect(remainingSeconds()).toBe(30);
  });

  it("beginUnlockSession again resets full 60s", async () => {
    await beginUnlockSession();
    vi.advanceTimersByTime(40_000);
    expect(remainingSeconds()).toBe(20);
    await beginUnlockSession();
    expect(remainingSeconds()).toBe(60);
    expect(retreatPct()).toBeCloseTo(0, 0);
  });

  it("expires and locks prefs", async () => {
    await beginUnlockSession();
    vi.advanceTimersByTime(UNLOCK_DURATION_MS + 200);
    await vi.runOnlyPendingTimersAsync();
    expect(isUnlockSessionActive()).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith(
      "/settings/app_preferences",
      expect.objectContaining({
        body: { datasource_locked: true },
      }),
    );
  });

  it("lockDatasourceNow clears session and locks", async () => {
    await beginUnlockSession();
    await lockDatasourceNow();
    expect(isUnlockSessionActive()).toBe(false);
    expect(_testGetUnlockUntil()).toBe(0);
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/settings/app_preferences",
      expect.objectContaining({
        body: { datasource_locked: true },
      }),
    );
  });

  it("_testSetUnlockUntil can force active window", () => {
    _testSetUnlockUntil(Date.now() + 5_000);
    expect(isUnlockSessionActive()).toBe(true);
    expect(remainingSeconds()).toBe(5);
  });
});
