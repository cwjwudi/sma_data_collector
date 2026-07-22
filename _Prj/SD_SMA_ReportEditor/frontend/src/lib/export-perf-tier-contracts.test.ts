/**
 * 035 契约：档位模型 + prefs/UI/导出接线门禁
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EXPORT_PERF_TIER,
  resolveExportPerfProfile,
} from "@/lib/export-perf-tier";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");
const frontendRoot = join(here, "../..");

function read(rel: string): string {
  return readFileSync(join(srcRoot, rel), "utf8");
}

describe("export-perf-tier contracts (035)", () => {
  it("phase A: model module is the source of tier knobs", () => {
    expect(DEFAULT_EXPORT_PERF_TIER).toBe(2);
    expect(resolveExportPerfProfile(2).label).toBe("预览稳");
    expect(resolveExportPerfProfile(1).layoutFidelity).toBe("layout-v2");
    const mod = read("lib/export-perf-tier.ts");
    expect(mod).toMatch(/export function resolveExportPerfProfile/);
    expect(mod).toMatch(/export function migrateExportPerfTierFromLegacy/);
    expect(mod).toMatch(/export function shouldPauseCoexistTasks/);
    expect(mod).toMatch(/ExportPerfTier = 0 \| 1 \| 2 \| 3 \| 4/);
  });

  it("T4: prefs default exportPerfTier=2", () => {
    const prefs = read("lib/report-generator-prefs.ts");
    expect(prefs).toMatch(/exportPerfTier:\s*DEFAULT_EXPORT_PERF_TIER|exportPerfTier:\s*2/);
    expect(prefs).toMatch(/migrateExportPerfTierFromLegacy/);
    expect(prefs).toMatch(/syncPrefsFromExportPerfTier/);
  });

  it("T6: ReportGenerator / auto-export resolve engine via resolveExportPerfProfile", () => {
    const rg = read("views/ReportGenerator.vue");
    expect(rg).toMatch(/resolveExportPerfProfile/);
    expect(rg).toMatch(/exportProfile\.engine|exportPerfProfile/);
    expect(rg).toMatch(/yieldMs:\s*exportProfile\.yieldMs/);
    expect(rg).toMatch(/layoutFidelity:\s*exportProfile\.layoutFidelity/);
    expect(rg).toMatch(/max="4"/);
    const auto = read("lib/report-auto-export-trigger-service.ts");
    expect(auto).toMatch(/resolveExportPerfProfile/);
    expect(auto).toMatch(/engine:\s*exportProfile\.engine/);
    expect(auto).toMatch(/layoutFidelity:\s*exportProfile\.layoutFidelity/);
    expect(auto).toMatch(/beginExportCoexistSession/);
  });

  it("T8: ReportGenerator stepped exportPerfTier control; dual engine tabs removed", () => {
    const rg = read("views/ReportGenerator.vue");
    expect(rg).toMatch(/exportPerfTier/);
    expect(rg).toMatch(/rg-export-perf-tier|rg-perf-tier__range/);
    expect(rg).toMatch(/type="range"/);
    expect(rg).not.toMatch(/同机优先（草稿）/);
    expect(rg).not.toMatch(/prefs\.pdfExportEngine\s*=\s*['"]chromium['"]/);
  });

  it("main exposes pdf-export-set-perf-profile, yieldMs, background idle", () => {
    const main = readFileSync(join(frontendRoot, "electron/main.cjs"), "utf8");
    expect(main).toMatch(/pdf-export-set-perf-profile/);
    expect(main).toMatch(/pdfExportPrewarmPoolSize/);
    expect(main).toMatch(/jobYieldMs/);
    expect(main).toMatch(/syncMainWindowBackgroundIdle/);
    expect(main).toMatch(/layoutFidelity/);
    const preload = readFileSync(join(frontendRoot, "electron/preload.cjs"), "utf8");
    expect(preload).toMatch(/setPdfExportPerfProfile/);
    expect(preload).toMatch(/onAppResourceMode/);
    const lv2 = read("lib/report-template/pdf-lib-layout-v2-render.ts");
    expect(lv2).toMatch(/appendPdfLibLayoutV2Pages/);
    expect(lv2).toMatch(/bodyCards/);
    expect(lv2).toMatch(/computeExpandedBodyPreviewCards|sqlFillTableSlices/);
    expect(read("lib/report-template/pdf-lib-export-render.ts")).toMatch(
      /bodyCards:\s*report\.bodyCards/,
    );
  });
});
