/**
 * 035：模拟结批分卷并行契约（主进程池 + 生成页 UI）
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "../..");

function readFront(rel: string): string {
  return readFileSync(join(frontendRoot, rel), "utf8");
}

describe("part-parallel export contracts (035)", () => {
  it("main.cjs：分卷并行池 + 额外槽位 + renderPartOnWindow", () => {
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/function runPartIndexPool/);
    expect(main).toMatch(/async function renderPartOnWindow/);
    expect(main).toMatch(/partParallel/);
    expect(main).toMatch(/PDF 分卷并行/);
    expect(main).toMatch(/acquirePdfExportSlot\(\)/);
    expect(main).toMatch(/extraSlots/);
    // 串行回退仍保留 yield
    expect(main).toMatch(/concurrency <= 1/);
    expect(main).toMatch(/yieldToOs\(jobYieldMs\)/);
  });

  it("main.cjs：并行遮罩按 worker 分栏显示第几份", () => {
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/exportOverlayWorkerLanes/);
    expect(main).toMatch(/upsertExportOverlayWorkerLane/);
    expect(main).toMatch(/workerSlot/);
    expect(main).toMatch(/ov-workers/);
    expect(main).toMatch(/并行 /);
    expect(main).toMatch(/已完成 /);
    // 乱序完成按已保存份数计数，禁止 max\(partIndex\+1\) 虚高
    expect(main).toMatch(/savedParts/);
    expect(main).toMatch(/Object\.keys\(exportOverlayEta\.savedParts\)\.length/);
    // 进度事件带 workers 快照，供任一档位 toast/侧栏分路显示
    expect(main).toMatch(/msg\.workers/);
    expect(main).toMatch(/msg\.completedParts/);
    // 心跳不得用 undefined/0 冲掉已得知的 totalReports（否则分路 UI 闪没、ETA 永预估中）
    expect(main).toMatch(/function mergeExportOverlayProgress/);
    expect(main).toMatch(/prevTotal > 0 && nextTotal <= 0/);
  });

  it("ReportGenerator / 自动结批：并行进度走分路文案", () => {
    const rg = readFront("src/views/ReportGenerator.vue");
    const auto = readFront("src/lib/report-auto-export-trigger-service.ts");
    expect(rg).toMatch(/formatPdfExportParallelProgressDetail/);
    expect(auto).toMatch(/formatPdfExportParallelProgressDetail/);
    expect(rg).toMatch(/生效 \{\{ effectivePartParallel \}\}/);
  });

  it("不妥协忽略 CPU 预算：设 16 可真正 16 路", () => {
    const main = readFront("electron/main.cjs");
    const budget = readFront("src/lib/export-cpu-budget.ts");
    const rg = readFront("src/views/ReportGenerator.vue");
    const auto = readFront("src/lib/report-auto-export-trigger-service.ts");
    expect(main).toMatch(/pdfExportIgnoreCpuBudget/);
    expect(budget).toMatch(/ignoreCpuBudget/);
    expect(rg).toMatch(/coexistPause === ["']max["']/);
    expect(rg).toMatch(/ignoreCpuBudget/);
    expect(auto).toMatch(/ignoreCpuBudget:\s*profile\.coexistPause === ["']max["']/);
    expect(rg).toMatch(/已关闭 CPU 预算封顶/);
  });

  it("ReportGenerator：模拟结批卡片露出分卷并行数", () => {
    const rg = readFront("src/views/ReportGenerator.vue");
    const manualH3 = rg.indexOf('<h3 class="rg-h3">{{ RG_UI.manual }}</h3>');
    const partParallel = rg.indexOf('id="rg-manual-part-parallel"');
    const opcH3 = rg.indexOf('<h3 class="rg-h3">{{ RG_UI.opcAuto }}</h3>');
    expect(manualH3).toBeGreaterThanOrEqual(0);
    expect(partParallel).toBeGreaterThan(manualH3);
    expect(opcH3).toBeGreaterThan(partParallel);
    expect(rg).toMatch(/分卷并行数/);
    expect(rg).toMatch(/prefs\.auto\.maxParallelExports/);
  });
});
