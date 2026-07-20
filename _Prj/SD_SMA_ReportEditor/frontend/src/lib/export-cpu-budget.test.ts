import { describe, expect, it } from "vitest";
import {
  cpuBudgetMaxParallel,
  exportCpuBudgetHint,
  logicalCpuCount,
  resolveAutoExportMaxParallel,
} from "@/lib/export-cpu-budget";

describe("export-cpu-budget (030)", () => {
  it("U1: ≤4 logical cores budget is 1 (i3-7100U / Hypervisor)", () => {
    expect(cpuBudgetMaxParallel(1)).toBe(1);
    expect(cpuBudgetMaxParallel(2)).toBe(1);
    expect(cpuBudgetMaxParallel(3)).toBe(1);
    expect(cpuBudgetMaxParallel(4)).toBe(1);
  });

  it("U2: 5–8 cores budget is 2; stronger scales by /4", () => {
    expect(cpuBudgetMaxParallel(5)).toBe(2);
    expect(cpuBudgetMaxParallel(8)).toBe(2);
    expect(cpuBudgetMaxParallel(12)).toBe(3);
    expect(cpuBudgetMaxParallel(16)).toBe(4);
  });

  it("U3: resolve caps configured 4 down to 1 on dual-core class hosts", () => {
    expect(resolveAutoExportMaxParallel(4, 3)).toBe(1);
    expect(resolveAutoExportMaxParallel(4, 4)).toBe(1);
    expect(resolveAutoExportMaxParallel(1, 4)).toBe(1);
    expect(resolveAutoExportMaxParallel(4, 8)).toBe(2);
    expect(resolveAutoExportMaxParallel(3, 16)).toBe(3);
  });

  it("U4: logicalCpuCount respects override", () => {
    expect(logicalCpuCount(3)).toBe(3);
    expect(exportCpuBudgetHint(3)).toMatch(/并行预算为 1/);
  });
});
