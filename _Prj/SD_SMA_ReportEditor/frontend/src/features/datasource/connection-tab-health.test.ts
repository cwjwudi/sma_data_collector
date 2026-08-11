import { describe, expect, it, vi } from "vitest";
import { probeConnectionIds } from "./connection-tab-health";

describe("probeConnectionIds", () => {
  it("limits concurrency (default 2) so a slow probe does not start all at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const ids = ["a", "b", "c", "d"];
    const probe = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return { ok: true, message: "" };
    });
    const onState = vi.fn();
    await probeConnectionIds(ids, probe, onState, "test-concurrency");
    expect(probe).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(onState).toHaveBeenCalledTimes(4);
  });

  it("concurrency 0 keeps legacy full-parallel behavior", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const ids = ["a", "b", "c"];
    const probe = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return { ok: false, message: "x" };
    });
    await probeConnectionIds(ids, probe, vi.fn(), "test-full", { concurrency: 0 });
    expect(maxInFlight).toBe(3);
  });
});
