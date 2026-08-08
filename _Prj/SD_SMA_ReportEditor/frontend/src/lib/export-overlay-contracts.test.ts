/**
 * 039 / 039c 契约：导出全屏遮罩接线门禁（main 主进程 + preload 桥 + 配置 + UI）
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const frontendRoot = join(here, "../..");

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), "utf8");
}
function readFront(rel: string): string {
  return readFileSync(join(frontendRoot, rel), "utf8");
}

describe("export-overlay contracts (039 / 039c)", () => {
  it("main.cjs：导出计数开合遮罩 + bounds 盖任务栏 + 置顶 + 按份 120s", () => {
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/beginExportOverlaySession\(\)/);
    expect(main).toMatch(/endExportOverlaySession\(\)/);
    expect(main).toMatch(/function showExportOverlay/);
    expect(main).toMatch(/function hideExportOverlay/);
    expect(main).toMatch(/function resolveOverlayDisplays/);
    expect(main).toMatch(/screen\.getPrimaryDisplay\(\)/);
    // 039c：用 bounds 铺满（含任务栏/Dock），禁止 setFullScreen 留系统栏
    expect(main).toMatch(/assertOverlayWindowOnTop/);
    expect(main).toMatch(/setBounds\(bounds/);
    expect(main).not.toMatch(/win\.setFullScreen\(true\)/);
    expect(main).toMatch(/setAlwaysOnTop\(true, 'screen-saver'\)/);
    expect(main).toMatch(/EXPORT_OVERLAY_MAX_MS\s*=\s*120000/);
    // Q1A：每份开始续期
    expect(main).toMatch(/function noteExportOverlayPartStart/);
    expect(main).toMatch(/armExportOverlayTimeout\(\)/);
    expect(main).toMatch(/before-input-event/);
    expect(main).toMatch(/export-overlay-dismiss/);
    // 051：强关后可经 IPC 显式重开全屏遮罩
    expect(main).toMatch(/function reshowExportOverlay/);
    expect(main).toMatch(/export-overlay-reshow/);
    expect(main).toMatch(/exportOverlaySuppressed/);
    // 进度喂给遮罩（第 x/共 y 份）
    expect(main).toMatch(/pushExportOverlayProgress/);
    expect(main).toMatch(/if \(fiveTierExportSpec\) return false/);
    // 039c：触发范围 + ETA + 反馈包
    expect(main).toMatch(/function shouldArmExportOverlay/);
    expect(main).toMatch(/exportSource/);
    expect(main).toMatch(/etaLabel/);
    expect(main).toMatch(/export-overlay-support-pack/);
    expect(main).toMatch(/stageLabel/);
    // 039d：右下角 CPU/内存曲线
    expect(main).toMatch(/host-resource-sample\.cjs/);
    expect(main).toMatch(/startExportOverlayMetricsTick/);
    expect(main).toMatch(/export-overlay-metrics/);
    expect(main).toMatch(/ov-cpu-chart/);
    expect(main).toMatch(/ov-mem-chart/);
  });

  it("overlay-preload.cjs：onProgress / onMetrics / dismiss / exportSupportPack", () => {
    const preload = readFront("electron/overlay-preload.cjs");
    expect(preload).toMatch(/exposeInMainWorld\('exportOverlay'/);
    expect(preload).toMatch(/onProgress/);
    expect(preload).toMatch(/onMetrics/);
    expect(preload).toMatch(/dismiss/);
    expect(preload).toMatch(/exportSupportPack/);
    expect(preload).toMatch(/export-overlay-progress/);
    expect(preload).toMatch(/export-overlay-metrics/);
    expect(preload).toMatch(/export-overlay-dismiss/);
    expect(preload).toMatch(/export-overlay-support-pack/);
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/overlay-preload\.cjs/);
    // 主窗口 preload 暴露 reshow
    const appPreload = readFront("electron/preload.cjs");
    expect(appPreload).toMatch(/reshowExportOverlay/);
    expect(appPreload).toMatch(/export-overlay-reshow/);
  });

  it("配置：launch 默认开 + display/trigger；UI 透出", () => {
    const launch = readFront("electron/launch.cjs");
    expect(launch).toMatch(/exportOverlayEnabled/);
    expect(launch).toMatch(/exportOverlayEnabled === undefined \? true/);
    expect(launch).toMatch(/exportOverlayDisplay/);
    expect(launch).toMatch(/exportOverlayTrigger/);
    expect(launch).toMatch(/normalizeOverlayDisplay/);
    expect(launch).toMatch(/normalizeOverlayTrigger/);
    const ui = readSrc("features/settings/LaunchSettingsSection.vue");
    expect(ui).toMatch(/toggleExportOverlay/);
    expect(ui).toMatch(/exportOverlayEnabled/);
    expect(ui).toMatch(/exportOverlayDisplay/);
    expect(ui).toMatch(/exportOverlayTrigger/);
    expect(ui).toMatch(/onDisplayChange/);
    expect(ui).toMatch(/onTriggerChange/);
    expect(readSrc("vite-env.d.ts")).toMatch(/exportOverlayEnabled\?: boolean/);
    expect(readSrc("vite-env.d.ts")).toMatch(/exportOverlayDisplay\?:/);
    expect(readSrc("vite-env.d.ts")).toMatch(/exportOverlayTrigger\?:/);
    expect(readSrc("vite-env.d.ts")).toMatch(/exportSource\?:/);
  });

  it("渲染页心跳带 stage；自动/手动传 exportSource", () => {
    const view = readSrc("views/PdfExportView.vue");
    expect(view).toMatch(/pulseExportHeartbeat/);
    expect(view).toMatch(/"fetch"/);
    expect(view).toMatch(/"render"/);
    expect(readSrc("lib/report-auto-export-trigger-service.ts")).toMatch(/exportSource:\s*"auto"/);
    expect(readSrc("views/ReportGenerator.vue")).toMatch(/exportSource:\s*"manual"/);
  });

  it("050：导出窗/遮罩安全销毁（hide + setImmediate destroy）防 Accessibility SIGSEGV", () => {
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/function safeDestroyBrowserWindow/);
    expect(main).toMatch(/setTimeout\(run,\s*300\)/);
    expect(main).toMatch(/safeDestroyBrowserWindow\(w,/);
    expect(main).toMatch(/safeDestroyBrowserWindow\(win,/);
    expect(main).toMatch(/backgroundColor: '#0b1120'/);
    expect(main).toMatch(/focusable: false/);
    expect(main).toMatch(/endExportOverlaySession\(\)[\s\S]*?setImmediate\(resolve\)/);
    expect(main).toMatch(/function pdfExportWarmPoolAllowed/);
    expect(main).toMatch(/process\.platform === ['"]darwin['"]/);
  });
});
