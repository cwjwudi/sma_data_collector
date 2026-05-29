import { describe, expect, it } from "vitest";
import { createTemplate } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  templateExportPageCount,
  templateHasBackSheet,
  templateHasCoverSheet,
} from "@/lib/report-template/editor-sheet";

describe("templateHasCoverSheet / templateHasBackSheet", () => {
  it("returns false when wizard chose none (no preset, no content)", () => {
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
    expect(templateHasCoverSheet(t)).toBe(false);
    expect(templateHasBackSheet(t)).toBe(false);
    expect(templateExportPageCount(t, 1)).toBe(1);
  });

  it("returns true when cover preset is bound", () => {
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
      coverLayoutPresetId: "preset-cover-1",
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
    expect(templateHasCoverSheet(t)).toBe(true);
    expect(templateExportPageCount(t, 2)).toBe(3);
  });
});
