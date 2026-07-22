/**
 * 035 阶段 C/D/E 契约：阶段 A 先以 todo 占位，接线后改为正式断言。
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

function read(rel: string): string {
  return readFileSync(join(srcRoot, rel), "utf8");
}

describe("export-perf-tier contracts (035)", () => {
  it("phase A: model module is the source of tier knobs", () => {
    expect(DEFAULT_EXPORT_PERF_TIER).toBe(2);
    expect(resolveExportPerfProfile(2).label).toBe("均衡");
    const mod = read("lib/export-perf-tier.ts");
    expect(mod).toMatch(/export function resolveExportPerfProfile/);
    expect(mod).toMatch(/export function migrateExportPerfTierFromLegacy/);
    expect(mod).toMatch(/export function shouldPauseCoexistTasks/);
  });

  // 阶段 B：prefs 接线后启用
  it.todo("T4: reportGeneratorPrefs default exportPerfTier=2 and round-trip");

  // 阶段 D：导出接线后启用
  it.todo("T6: ReportGenerator / auto-export resolve engine via resolveExportPerfProfile");

  // 阶段 C：UI 滑条后启用
  it.todo("T8: ReportGenerator stepped exportPerfTier control; dual engine tabs removed");
});
