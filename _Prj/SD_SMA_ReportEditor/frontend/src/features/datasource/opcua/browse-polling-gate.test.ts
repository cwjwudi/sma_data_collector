import { describe, expect, it, vi } from "vitest";
import { createBrowsePollingGate } from "./browse-polling-gate";

describe("browse-polling-gate (034 M4 / L8)", () => {
  it("pause blocks syncAll from re-arming timers", () => {
    const clearAll = vi.fn();
    const syncWhenAllowed = vi.fn();
    const gate = createBrowsePollingGate({ clearAll, syncWhenAllowed });

    gate.pause();
    expect(gate.isAllowed()).toBe(false);
    expect(clearAll).toHaveBeenCalledTimes(1);

    gate.syncAll();
    expect(syncWhenAllowed).not.toHaveBeenCalled();
    expect(clearAll).toHaveBeenCalledTimes(2);
  });

  it("resume with canPoll re-arms; without canPoll only opens latch", () => {
    const clearAll = vi.fn();
    const syncWhenAllowed = vi.fn();
    const gate = createBrowsePollingGate({ clearAll, syncWhenAllowed });

    gate.pause();
    gate.resume(false);
    expect(gate.isAllowed()).toBe(true);
    expect(syncWhenAllowed).not.toHaveBeenCalled();

    gate.resume(true);
    expect(syncWhenAllowed).toHaveBeenCalledTimes(1);

    gate.syncAll();
    expect(syncWhenAllowed).toHaveBeenCalledTimes(2);
  });
});
