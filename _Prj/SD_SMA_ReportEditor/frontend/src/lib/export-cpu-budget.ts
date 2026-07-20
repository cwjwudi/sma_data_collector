/**
 * 结批导出 CPU 预算（030）：同机 mappView / MariaDB / Hypervisor 时限制并行。
 * i3-7100U 物理 2C/4T；Hypervisor 再占一核后 Windows 逻辑核更少，≤4 逻辑核只允许 1 路。
 */

import {
  AUTO_EXPORT_MAX_PARALLEL_DEFAULT,
  AUTO_EXPORT_MAX_PARALLEL_HARD_CAP,
  clampAutoExportMaxParallel,
} from "@/lib/auto-export-status-codes";

/** 读取逻辑 CPU 数（浏览器/Electron 渲染进程用 hardwareConcurrency） */
export function logicalCpuCount(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 1) {
    return Math.floor(override);
  }
  try {
    const n = Number(
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency : Number.NaN,
    );
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  } catch {
    /* ignore */
  }
  return 4;
}

/**
 * 本机建议的并行上限（硬预算，不是 UI 输入 clamp）。
 * - ≤4 逻辑核 → 1（工控双核 + Hypervisor / 同机 HMI+DB）
 * - ≤8 → 2
 * - 更强机器 → floor(cores/4)，仍不超过硬顶
 */
export function cpuBudgetMaxParallel(logicalCores: number): number {
  const n = Math.max(1, Math.floor(Number(logicalCores) || 1));
  if (n <= 4) return 1;
  if (n <= 8) return 2;
  return Math.min(AUTO_EXPORT_MAX_PARALLEL_HARD_CAP, Math.floor(n / 4));
}

/** 配置值经 1..16 clamp 后再按 CPU 预算封顶 */
export function resolveAutoExportMaxParallel(
  configured: unknown,
  logicalCores?: number,
): number {
  const want = clampAutoExportMaxParallel(configured);
  const budget = cpuBudgetMaxParallel(logicalCpuCount(logicalCores));
  return Math.min(want, budget);
}

export function exportCpuBudgetHint(logicalCores?: number): string {
  const cores = logicalCpuCount(logicalCores);
  const budget = cpuBudgetMaxParallel(cores);
  if (budget <= 1) {
    return `本机约 ${cores} 逻辑核（含 Hypervisor/同机 HMI 场景）：并行预算为 1，避免挤占 mappView。`;
  }
  return `本机约 ${cores} 逻辑核：并行预算上限 ${budget}（设置更高也不会超过预算）。`;
}

export { AUTO_EXPORT_MAX_PARALLEL_DEFAULT };
