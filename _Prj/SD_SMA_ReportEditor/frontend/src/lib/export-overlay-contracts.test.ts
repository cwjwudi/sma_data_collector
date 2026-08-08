/**
 * 039 契约：导出全屏遮罩接线门禁（main 主进程 + preload 桥 + 配置 + UI 开关）
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

describe("export-overlay contracts (039)", () => {
  it("main.cjs：导出计数开合遮罩 + 主显示器全屏 + 置顶 + 120s 硬超时", () => {
    const main = readFront("electron/main.cjs");
    // 导出开始/结束成对开合遮罩，与 register/unregister 对称
    expect(main).toMatch(/beginExportOverlaySession\(\)/);
    expect(main).toMatch(/endExportOverlaySession\(\)/);
    expect(main).toMatch(/function showExportOverlay/);
    expect(main).toMatch(/function hideExportOverlay/);
    // 主显示器全屏 + 置顶盖住 mappView
    expect(main).toMatch(/screen\.getPrimaryDisplay\(\)/);
    expect(main).toMatch(/setAlwaysOnTop\(true, 'screen-saver'\)/);
    // 硬超时 120s，防遮罩卡死锁住 HMI
    expect(main).toMatch(/EXPORT_OVERLAY_MAX_MS\s*=\s*120000/);
    // Esc 兜底 + 用户强关 IPC
    expect(main).toMatch(/before-input-event/);
    expect(main).toMatch(/export-overlay-dismiss/);
    // 051：强关后可经 IPC 显式重开全屏遮罩
    expect(main).toMatch(/function reshowExportOverlay/);
    expect(main).toMatch(/export-overlay-reshow/);
    expect(main).toMatch(/exportOverlaySuppressed/);
    // 进度喂给遮罩（第 x/共 y 份）
    expect(main).toMatch(/pushExportOverlayProgress/);
    // 五档批导不弹遮罩
    expect(main).toMatch(/if \(fiveTierExportSpec\) return false/);
  });

  it("overlay-preload.cjs：仅暴露 onProgress / dismiss，加载静态内联页", () => {
    const preload = readFront("electron/overlay-preload.cjs");
    expect(preload).toMatch(/exposeInMainWorld\('exportOverlay'/);
    expect(preload).toMatch(/onProgress/);
    expect(preload).toMatch(/dismiss/);
    expect(preload).toMatch(/export-overlay-progress/);
    expect(preload).toMatch(/export-overlay-dismiss/);
    // 遮罩窗使用该 preload
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/overlay-preload\.cjs/);
    // 主窗口 preload 暴露 reshow
    const appPreload = readFront("electron/preload.cjs");
    expect(appPreload).toMatch(/reshowExportOverlay/);
    expect(appPreload).toMatch(/export-overlay-reshow/);
  });

  it("配置：launch.cjs 默认开启、UI/类型透出 exportOverlayEnabled", () => {
    const launch = readFront("electron/launch.cjs");
    expect(launch).toMatch(/exportOverlayEnabled/);
    // 缺省视为开启
    expect(launch).toMatch(/exportOverlayEnabled === undefined \? true/);
    // 设置页开关
    const ui = readSrc("features/settings/LaunchSettingsSection.vue");
    expect(ui).toMatch(/toggleExportOverlay/);
    expect(ui).toMatch(/exportOverlayEnabled/);
    // 渲染进程类型声明
    expect(readSrc("vite-env.d.ts")).toMatch(/exportOverlayEnabled\?: boolean/);
  });

  it("039b：改遮罩不碰登录项；reg 中文报错按 GBK 解码", () => {
    const main = readFront("electron/main.cjs");
    expect(main).toMatch(/patchTouchesLoginItem/);
    expect(main).toMatch(/touchLogin/);
    const launch = readFront("electron/launch.cjs");
    expect(launch).toMatch(/decodeWindowsConsole/);
    expect(launch).toMatch(/isRegNotFoundMessage/);
    expect(launch).toMatch(/encoding:\s*'buffer'/);
  });
});
