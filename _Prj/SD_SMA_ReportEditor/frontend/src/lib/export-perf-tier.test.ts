import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_PERF_TIER,
  listExportPerfProfiles,
  migrateExportPerfTierFromLegacy,
  normalizeExportPerfTier,
  resolveExportPerfProfile,
  shouldPauseCoexistTasks,
} from "@/lib/export-perf-tier";

describe("export-perf-tier (035 T1–T3/T5/T7)", () => {
  it("T1: normalize defaults to 2 (均衡); clamps invalid; keeps 0–3", () => {
    expect(normalizeExportPerfTier(undefined)).toBe(2);
    expect(normalizeExportPerfTier(null)).toBe(2);
    expect(normalizeExportPerfTier("")).toBe(2);
    expect(normalizeExportPerfTier(-1)).toBe(2);
    expect(normalizeExportPerfTier(99)).toBe(2);
    expect(normalizeExportPerfTier("x")).toBe(2);
    expect(normalizeExportPerfTier(0)).toBe(0);
    expect(normalizeExportPerfTier(1)).toBe(1);
    expect(normalizeExportPerfTier(2)).toBe(2);
    expect(normalizeExportPerfTier(3)).toBe(3);
    expect(normalizeExportPerfTier("3")).toBe(3);
    expect(DEFAULT_EXPORT_PERF_TIER).toBe(2);
  });

  it("T2: four-tier knobs table is frozen", () => {
    const t0 = resolveExportPerfProfile(0);
    expect(t0).toMatchObject({
      engine: "pdf-lib",
      prewarmPoolSize: 0,
      maxParallelHint: 1,
      yieldMs: 200,
      coexistPause: "full",
      pdfQuality: "draft",
      label: "最省机",
    });

    const t1 = resolveExportPerfProfile(1);
    expect(t1).toMatchObject({
      engine: "chromium",
      prewarmPoolSize: 0,
      maxParallelHint: 1,
      yieldMs: 200,
      coexistPause: "full",
      pdfQuality: "preview",
      label: "同机稳",
    });

    const t2 = resolveExportPerfProfile(2);
    expect(t2).toMatchObject({
      engine: "chromium",
      prewarmPoolSize: 1,
      maxParallelHint: 1,
      yieldMs: 80,
      coexistPause: "full",
      pdfQuality: "preview",
      label: "均衡",
    });

    const t3 = resolveExportPerfProfile(3);
    expect(t3).toMatchObject({
      engine: "chromium",
      prewarmPoolSize: 2,
      maxParallelHint: 2,
      yieldMs: 40,
      coexistPause: "basic",
      pdfQuality: "preview",
      label: "最快出图",
    });

    expect(t0.yieldMs).toBeGreaterThan(t2.yieldMs);
    expect(t2.yieldMs).toBeGreaterThan(t3.yieldMs);
    expect(t1.prewarmPoolSize).toBeLessThan(t2.prewarmPoolSize);
    expect(t2.prewarmPoolSize).toBeLessThan(t3.prewarmPoolSize);
  });

  it("T3: default profile is tier 2 preview-level chromium", () => {
    const p = resolveExportPerfProfile(undefined);
    expect(p.tier).toBe(2);
    expect(p.isDefault).toBe(true);
    expect(p.engine).toBe("chromium");
    expect(p.pdfQuality).toBe("preview");
    expect(resolveExportPerfProfile(0).isDefault).toBe(false);
    expect(listExportPerfProfiles()).toHaveLength(4);
  });

  it("T5: migrate from legacy engine; explicit tier wins", () => {
    expect(migrateExportPerfTierFromLegacy({ pdfExportEngine: "pdf-lib" })).toEqual({
      tier: 0,
      fromLegacy: true,
    });
    expect(migrateExportPerfTierFromLegacy({ pdfExportEngine: "chromium" })).toEqual({
      tier: 2,
      fromLegacy: true,
    });
    expect(migrateExportPerfTierFromLegacy({})).toEqual({
      tier: 2,
      fromLegacy: true,
    });
    expect(
      migrateExportPerfTierFromLegacy({
        exportPerfTier: 1,
        pdfExportEngine: "pdf-lib",
      }),
    ).toEqual({ tier: 1, fromLegacy: false });
    expect(
      migrateExportPerfTierFromLegacy({
        exportPerfTier: "3",
        pdfExportEngine: "pdf-lib",
      }),
    ).toEqual({ tier: 3, fromLegacy: false });
  });

  it("T7: coexist pause truth table", () => {
    expect(shouldPauseCoexistTasks(true, "full")).toBe(true);
    expect(shouldPauseCoexistTasks(false, "full")).toBe(false);
    expect(shouldPauseCoexistTasks(true, "basic")).toBe(false);
    expect(shouldPauseCoexistTasks(false, "basic")).toBe(false);
  });
});
