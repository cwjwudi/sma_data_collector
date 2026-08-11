import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_PERF_TIER,
  listExportPerfProfiles,
  migrateExportPerfTierFromLegacy,
  normalizeExportPerfTier,
  remapFourTierToFive,
  resolveExportPerfProfile,
  shouldPauseCoexistTasks,
} from "@/lib/export-perf-tier";

describe("export-perf-tier (035 five-tier)", () => {
  it("T1: normalize defaults to 2; clamps invalid; keeps 0–4", () => {
    expect(normalizeExportPerfTier(undefined)).toBe(2);
    expect(normalizeExportPerfTier(null)).toBe(2);
    expect(normalizeExportPerfTier("")).toBe(2);
    expect(normalizeExportPerfTier(-1)).toBe(2);
    expect(normalizeExportPerfTier(99)).toBe(2);
    expect(normalizeExportPerfTier(0)).toBe(0);
    expect(normalizeExportPerfTier(1)).toBe(1);
    expect(normalizeExportPerfTier(2)).toBe(2);
    expect(normalizeExportPerfTier(3)).toBe(3);
    expect(normalizeExportPerfTier(4)).toBe(4);
    expect(normalizeExportPerfTier("4")).toBe(4);
    expect(DEFAULT_EXPORT_PERF_TIER).toBe(2);
  });

  it("T2: five-tier knobs table is frozen", () => {
    expect(resolveExportPerfProfile(0)).toMatchObject({
      engine: "pdf-lib",
      layoutFidelity: "draft-v1",
      prewarmPoolSize: 0,
      pdfQuality: "draft",
      label: "仅内容",
    });
    expect(resolveExportPerfProfile(1)).toMatchObject({
      engine: "pdf-lib",
      layoutFidelity: "layout-v2",
      prewarmPoolSize: 0,
      pdfQuality: "layout",
      label: "矢量版式",
    });
    expect(resolveExportPerfProfile(2)).toMatchObject({
      engine: "chromium",
      layoutFidelity: "print-to-pdf",
      // 0.3.140：默认档保留 1 预热窗免冷启动（同机让核仍靠 yield + 降载）
      prewarmPoolSize: 1,
      yieldMs: 200,
      coexistPause: "full",
      pdfQuality: "preview",
      label: "预览稳",
    });
    expect(resolveExportPerfProfile(3)).toMatchObject({
      engine: "chromium",
      prewarmPoolSize: 1,
      yieldMs: 80,
      coexistPause: "basic",
      label: "功能折中",
    });
    expect(resolveExportPerfProfile(4)).toMatchObject({
      engine: "chromium",
      prewarmPoolSize: 2,
      maxParallelHint: 2,
      yieldMs: 40,
      coexistPause: "max",
      label: "不妥协",
    });
    expect(listExportPerfProfiles()).toHaveLength(5);
  });

  it("T3: default profile is tier 2 preview-level chromium", () => {
    const p = resolveExportPerfProfile(undefined);
    expect(p.tier).toBe(2);
    expect(p.isDefault).toBe(true);
    expect(p.engine).toBe("chromium");
    expect(p.pdfQuality).toBe("preview");
    expect(p.label).toBe("预览稳");
  });

  it("T5: migrate engine + remap old four-tier scale", () => {
    expect(remapFourTierToFive(0)).toBe(0);
    expect(remapFourTierToFive(1)).toBe(2);
    expect(remapFourTierToFive(2)).toBe(3);
    expect(remapFourTierToFive(3)).toBe(4);

    expect(migrateExportPerfTierFromLegacy({ pdfExportEngine: "pdf-lib" })).toMatchObject({
      tier: 0,
      fromLegacy: true,
    });
    expect(migrateExportPerfTierFromLegacy({ pdfExportEngine: "chromium" })).toMatchObject({
      tier: 2,
      fromLegacy: true,
    });
    // 旧四档无 scale：2(均衡) → 3(功能折中)
    expect(
      migrateExportPerfTierFromLegacy({
        exportPerfTier: 2,
        pdfExportEngine: "chromium",
      }),
    ).toMatchObject({ tier: 3, fromLegacy: true, scale: 5 });
    // 已是五档：保留
    expect(
      migrateExportPerfTierFromLegacy({
        exportPerfTier: 1,
        exportPerfTierScale: 5,
        pdfExportEngine: "pdf-lib",
      }),
    ).toMatchObject({ tier: 1, fromLegacy: false, scale: 5 });
  });

  it("T7: coexist pause truth table", () => {
    expect(shouldPauseCoexistTasks(true, "full")).toBe(true);
    expect(shouldPauseCoexistTasks(false, "full")).toBe(false);
    expect(shouldPauseCoexistTasks(true, "basic")).toBe(false);
    expect(shouldPauseCoexistTasks(true, "max")).toBe(false);
  });
});
