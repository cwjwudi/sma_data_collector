import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mod = require(join(here, "../../electron/pdf-thumb-queue.cjs")) as {
  THUMB_MAX_CONCURRENCY: number;
  withThumbSlot: <T>(fn: () => Promise<T>) => Promise<T>;
  thumbQueueStats: () => { active: number; waiting: number; max: number };
  resetThumbQueueForTests: () => void;
};

describe("pdf-thumb-queue (032 P1-B / L5)", () => {
  afterEach(() => {
    mod.resetThumbQueueForTests();
  });

  it("L5: max concurrency is 2", () => {
    expect(mod.THUMB_MAX_CONCURRENCY).toBe(2);
    expect(mod.thumbQueueStats().max).toBe(2);
  });

  it("L5: never runs more than max concurrent slots", async () => {
    let peak = 0;
    let inFlight = 0;
    const tasks = Array.from({ length: 6 }, () =>
      mod.withThumbSlot(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight -= 1;
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(mod.THUMB_MAX_CONCURRENCY);
    expect(mod.thumbQueueStats().active).toBe(0);
    expect(mod.thumbQueueStats().waiting).toBe(0);
  });
});
