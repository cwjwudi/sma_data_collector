import { describe, expect, it } from "vitest";
import { createTemplate } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  applyLayoutPresetToTemplate,
  clearOptionalSheetFromTemplate,
  stripStaleOptionalSheetZones,
} from "@/lib/report-template/layout-apply";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { templateHasCoverSheet } from "@/lib/report-template/editor-sheet";

describe("clearOptionalSheetFromTemplate", () => {
  it("clears cover slot so templateHasCoverSheet becomes false", () => {
    const z = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
      paperKind: "A4",
      orientation: "portrait",
      layoutPresetId: null,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements,
      footerElements: z.footerElements,
      coverLayoutPresetId: null,
      coverLayoutSnapshot: z.layoutSnapshot,
      coverHeaderText: z.headerText,
      coverFooterText: z.footerText,
      coverHeaderElements: z.headerElements,
      coverFooterElements: z.footerElements,
      coverBodyZoneElements: z.bodyElements,
      backLayoutPresetId: null,
      backLayoutSnapshot: z.layoutSnapshot,
      backHeaderText: z.headerText,
      backFooterText: z.footerText,
      backHeaderElements: z.headerElements,
      backFooterElements: z.footerElements,
      backBodyZoneElements: z.bodyElements,
    });
    const preset: LayoutPreset = {
      id: "cov-1",
      name: "封面 A",
      updatedAt: "2026-01-01T00:00:00.000Z",
      paperKind: "A4",
      orientation: "portrait",
      marginTopMm: 15,
      marginBottomMm: 15,
      marginLeftMm: 15,
      marginRightMm: 15,
      pageRole: "cover",
      headerText: "HDR",
      footerText: "",
      headerElements: [{ id: "h1", type: "text", x: 1, y: 1, w: 10, h: 5, text: "x" }],
      footerElements: [],
      bodyElements: [],
      layoutSnapshot: z.layoutSnapshot,
    };
    applyLayoutPresetToTemplate(t, preset, "cover");
    expect(templateHasCoverSheet(t)).toBe(true);

    clearOptionalSheetFromTemplate(t, "cover");
    expect(t.coverLayoutPresetId).toBeNull();
    expect(templateHasCoverSheet(t)).toBe(false);
  });

  it("stripStaleOptionalSheetZones removes orphan zones when preset id was cleared", () => {
    const z = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
      paperKind: "A4",
      orientation: "portrait",
      layoutPresetId: null,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements,
      footerElements: z.footerElements,
      coverLayoutPresetId: null,
      coverLayoutSnapshot: z.layoutSnapshot,
      coverHeaderText: z.headerText,
      coverFooterText: z.footerText,
      coverHeaderElements: [{ id: "h1", type: "text", x: 1, y: 1, w: 10, h: 5, text: "x" }],
      coverFooterElements: z.footerElements,
      coverBodyZoneElements: z.bodyElements,
      backLayoutPresetId: null,
      backLayoutSnapshot: z.layoutSnapshot,
      backHeaderText: z.headerText,
      backFooterText: z.footerText,
      backHeaderElements: z.headerElements,
      backFooterElements: z.footerElements,
      backBodyZoneElements: z.bodyElements,
    });
    expect(templateHasCoverSheet(t)).toBe(true);
    expect(stripStaleOptionalSheetZones(t, "cover")).toBe(true);
    expect(templateHasCoverSheet(t)).toBe(false);
  });
});
