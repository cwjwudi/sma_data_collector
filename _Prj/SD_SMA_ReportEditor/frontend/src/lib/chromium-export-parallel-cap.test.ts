import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const {
  chromiumPartParallelCap,
  resolvePartExportConcurrency,
} = require(join(here, "../../electron/chromium-export-parallel-cap.cjs")) as {
  chromiumPartParallelCap: (bytes: number) => number;
  resolvePartExportConcurrency: (
    planned: number,
    totalReports: number,
    exportEngine: string,
    totalMemBytes?: number,
  ) => number;
};

const GB = 1024 ** 3;

describe("chromium-export-parallel-cap (052)", () => {
  it("按物理内存分级封顶（052c 按份切片后上调）", () => {
    expect(chromiumPartParallelCap(4 * GB)).toBe(4);
    expect(chromiumPartParallelCap(8 * GB)).toBe(8);
    expect(chromiumPartParallelCap(16 * GB)).toBe(12);
    expect(chromiumPartParallelCap(32 * GB)).toBe(16);
  });

  it("chromium 受内存帽；pdf-lib 可用满 planned", () => {
    expect(resolvePartExportConcurrency(16, 80, "chromium", 15 * GB)).toBe(8);
    expect(resolvePartExportConcurrency(16, 80, "pdf-lib", 15 * GB)).toBe(16);
    expect(resolvePartExportConcurrency(16, 3, "chromium", 32 * GB)).toBe(3);
  });
});
