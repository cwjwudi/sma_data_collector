import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import { createTemplate, type ReportTemplate } from "@/lib/report-template/model";
import { hydrateLayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import {
  copyCoverHeaderToBody,
  templateNeedsCoverHeaderCopyHint,
} from "@/lib/report-template/copy-sheet-bands";

function blankTemplate(): ReportTemplate {
  const z = blankZonesSnapshot();
  return createTemplate({
    name: "041-h1",
    paperKind: "A4",
    orientation: "portrait",
    layoutPresetId: null,
    layoutSnapshot: { ...z.layoutSnapshot, headerBandMm: 12 },
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    coverLayoutPresetId: null,
    coverLayoutSnapshot: { ...z.layoutSnapshot, headerBandMm: 20 },
    coverHeaderText: "",
    coverFooterText: "",
    coverHeaderElements: [],
    coverFooterElements: [],
    coverBodyZoneElements: [],
    backLayoutPresetId: null,
    backLayoutSnapshot: z.layoutSnapshot,
    backHeaderText: "",
    backFooterText: "",
    backHeaderElements: [],
    backFooterElements: [],
    backBodyZoneElements: [],
  });
}

describe("041 H1: copy cover header to body", () => {
  it("copies elements with new ids and raises headerBandMm", () => {
    const t = blankTemplate();
    t.coverHeaderText = "封面标题";
    t.coverHeaderElements = [
      hydrateLayoutZoneElement({
        id: "cov-h1",
        type: "text",
        text: "CoverHeader",
        x: 10,
        y: 4,
        w: 200,
        h: 20,
      }),
    ];
    expect(templateNeedsCoverHeaderCopyHint(t)).toBe(true);

    const r = copyCoverHeaderToBody(t);
    expect(r.copied).toBe(1);
    expect(r.replacedExisting).toBe(false);
    expect(r.headerBandMmRaised).toBe(true);
    expect(t.headerText).toBe("封面标题");
    expect(t.headerElements).toHaveLength(1);
    expect(t.headerElements[0]!.text).toBe("CoverHeader");
    expect(t.headerElements[0]!.id).not.toBe("cov-h1");
    expect(t.headerElements[0]!.x).toBe(10);
    expect(t.layoutSnapshot.headerBandMm).toBe(20);
    // 封面槽未改
    expect(t.coverHeaderElements[0]!.id).toBe("cov-h1");
    expect(templateNeedsCoverHeaderCopyHint(t)).toBe(false);
  });

  it("no-op when cover has no header", () => {
    const t = blankTemplate();
    const r = copyCoverHeaderToBody(t);
    expect(r.copied).toBe(0);
    expect(templateNeedsCoverHeaderCopyHint(t)).toBe(false);
  });

  it("reports replacedExisting when body already had header", () => {
    const t = blankTemplate();
    t.coverHeaderElements = [
      hydrateLayoutZoneElement({ id: "c", type: "text", text: "C", x: 0, y: 0, w: 40, h: 12 }),
    ];
    t.headerElements = [
      hydrateLayoutZoneElement({ id: "b", type: "text", text: "Old", x: 0, y: 0, w: 40, h: 12 }),
    ];
    expect(templateNeedsCoverHeaderCopyHint(t)).toBe(false);
    const r = copyCoverHeaderToBody(t);
    expect(r.replacedExisting).toBe(true);
    expect(t.headerElements[0]!.text).toBe("C");
    expect(t.headerElements[0]!.id).not.toBe("b");
  });
});
