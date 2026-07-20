/**
 * 032 生命周期契约测 L1–L6、L9 + P1 写盘/取消（源码级门禁，CI 必跑）
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const frontendRoot = join(here, "../..");

function read(relFromSrc: string): string {
  return readFileSync(join(srcRoot, relFromSrc), "utf8");
}

function collectDefineOptionNames(): Set<string> {
  const names = new Set<string>();
  const roots = [join(srcRoot, "views"), join(srcRoot, "layouts")];
  for (const root of roots) {
    let files: string[] = [];
    try {
      files = readdirSync(root).filter((f) => /\.vue$/.test(f));
    } catch {
      continue;
    }
    for (const f of files) {
      const text = readFileSync(join(root, f), "utf8");
      for (const m of text.matchAll(/defineOptions\(\s*\{\s*name:\s*['"]([^'"]+)['"]/g)) {
        if (m[1]) names.add(m[1]);
      }
    }
  }
  return names;
}

function parseKeepAliveInclude(): string[] {
  const layout = read("layouts/MainLayout.vue");
  const block = layout.match(/:include="\[([\s\S]*?)\]"/);
  expect(block, "MainLayout keep-alive include").toBeTruthy();
  const names = [...block![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  expect(names.length).toBeGreaterThan(5);
  return names;
}

describe("032 page lifecycle contracts", () => {
  it("L1: keep-alive include ⊆ defineOptions.name", () => {
    const include = parseKeepAliveInclude();
    const defined = collectDefineOptionNames();
    for (const name of include) {
      expect(defined.has(name), `include "${name}" missing matching defineOptions.name`).toBe(true);
    }
    expect(include).toContain("AiTools");
    expect(defined.has("AiTools")).toBe(true);
    expect(defined.has("AiToolsPage")).toBe(false);
  });

  it("L2: B 级 interval 页须接入 usePageLifecycle 或 onDeactivated 对称停表", () => {
    const must = [
      "views/ReportHistory.vue",
      "views/ReportGenerator.vue",
      "views/DataSourceConfig.vue",
      "views/LayoutPresets.vue",
      "views/SignaturesLibrary.vue",
      "features/dashboard/DashboardFieldOps.vue",
    ];
    for (const rel of must) {
      const src = read(rel);
      const hasLifecycle = /usePageLifecycle\s*\(/.test(src);
      const hasDeactivated = /onDeactivated\s*\(/.test(src);
      expect(
        hasLifecycle || hasDeactivated,
        `${rel} must use usePageLifecycle or onDeactivated for B-level timers`,
      ).toBe(true);
    }
  });

  it("L3: ReportHistory registers removable poll as page-focus B task", () => {
    const src = read("views/ReportHistory.vue");
    expect(src).toMatch(/usePageLifecycle\(\s*["']ReportHistory["']\s*\)/);
    expect(src).toMatch(/id:\s*["']removable-volume-poll["']/);
    expect(src).toMatch(/scope:\s*["']page-focus["']/);
    expect(src).toMatch(/pause:\s*stopRemovablePoll/);
  });

  it("L4: removable-volumes 热路径无 execFileSync", () => {
    const cjs = readFileSync(join(frontendRoot, "electron/removable-volumes.cjs"), "utf8");
    // 去掉块注释 / 行注释后再断言，避免文档文字误伤
    const code = cjs
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bexecFileSync\b/);
    expect(code).toMatch(/execFileAsync|promisify\(execFile\)/);
    expect(code).toMatch(/inFlightDetailed|inFlight/);
  });

  it("L5: 缩略图 IPC 走 withThumbSlot 且无 readFileSync", () => {
    const main = readFileSync(join(frontendRoot, "electron/main.cjs"), "utf8");
    expect(main).toMatch(/withThumbSlot/);
    const thumbHandler = main.slice(main.indexOf("get-export-pdf-thumbnail"));
    const code = thumbHandler
      .slice(0, 1200)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\breadFileSync\b/);
    expect(code).toMatch(/fs\.promises\.readFile/);
  });

  it("L6: Layout/签名 Observer 对齐 029 restart", () => {
    for (const rel of ["views/LayoutPresets.vue", "views/SignaturesLibrary.vue"]) {
      const src = read(rel);
      expect(src).toMatch(/nextThumbObserverAction/);
      expect(src).toMatch(/resync(Card|Row)Visibility/);
      expect(src).toMatch(/observerMode:\s*["']restart["']|planAfterHistoryEntriesChanged/);
    }
  });

  it("L9: ReportGenerator 金样 chart-refresh 注册为 B 级", () => {
    const src = read("views/ReportGenerator.vue");
    expect(src).toMatch(/usePageLifecycle\(\s*["']ReportGenerator["']\s*\)/);
    expect(src).toMatch(/id:\s*["']chart-refresh["']/);
    expect(src).toMatch(/pause:\s*stopChartRefresh/);
    expect(src).toMatch(/resume:\s*startChartRefresh/);
  });

  it("P1-C: pdf-export-run 写盘用 fs.promises.writeFile", () => {
    const main = readFileSync(join(frontendRoot, "electron/main.cjs"), "utf8");
    const slice = main.slice(main.indexOf("writePartPdf"));
    expect(slice).toMatch(/fs\.promises\.writeFile/);
    const writeBody = slice.slice(0, 500).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(writeBody).not.toMatch(/\bwriteFileSync\b/);
  });

  it("P1-D: pdf-export-cancel IPC + 失败清 fill-cache", () => {
    const main = readFileSync(join(frontendRoot, "electron/main.cjs"), "utf8");
    expect(main).toMatch(/pdf-export-cancel/);
    expect(main).toMatch(/cancelPdfExportJob|isPdfExportCancelled/);
    const preload = readFileSync(join(frontendRoot, "electron/preload.cjs"), "utf8");
    expect(preload).toMatch(/cancelPdfExport/);
    const rg = read("views/ReportGenerator.vue");
    expect(rg).toMatch(/clearPdfExportFillCacheAfterFailure/);
  });
});
