import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const {
  snapshotCpu,
  cpuPercentBetween,
  memorySample,
  pushRing,
  formatBytesShort,
} = require(join(here, "../../electron/host-resource-sample.cjs")) as {
  snapshotCpu: (cpus: unknown) => { idle: number; total: number; cores: number };
  cpuPercentBetween: (
    prev: { idle: number; total: number } | null,
    next: { idle: number; total: number },
  ) => number;
  memorySample: (
    total: number,
    free: number,
  ) => { memPercent: number; memUsedBytes: number; memTotalBytes: number };
  pushRing: (history: number[], value: number, maxLen: number) => number[];
  formatBytesShort: (n: number) => string;
};

describe("host-resource-sample (039d)", () => {
  it("snapshotCpu sums times and counts cores", () => {
    const s = snapshotCpu([
      { times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
      { times: { user: 20, nice: 0, sys: 10, idle: 70, irq: 0 } },
    ]);
    expect(s.cores).toBe(2);
    expect(s.idle).toBe(155);
    expect(s.total).toBe(200);
  });

  it("cpuPercentBetween returns busy ratio", () => {
    const a = { idle: 100, total: 200 };
    const b = { idle: 110, total: 300 }; // idle +10, total +100 → busy 90%
    expect(cpuPercentBetween(a, b)).toBeCloseTo(90, 5);
    expect(cpuPercentBetween(null, b)).toBe(0);
  });

  it("memorySample computes used percent", () => {
    const m = memorySample(8 * 1024 ** 3, 2 * 1024 ** 3);
    expect(m.memUsedBytes).toBe(6 * 1024 ** 3);
    expect(m.memPercent).toBeCloseTo(75, 5);
  });

  it("pushRing keeps max length", () => {
    let h: number[] = [];
    for (let i = 0; i < 5; i++) h = pushRing(h, i, 3);
    expect(h).toEqual([2, 3, 4]);
  });

  it("formatBytesShort", () => {
    expect(formatBytesShort(3.5 * 1024 ** 3)).toBe("3.5 GB");
    expect(formatBytesShort(512 * 1024 ** 2)).toBe("512 MB");
  });
});
