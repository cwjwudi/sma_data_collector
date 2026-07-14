import { describe, expect, it } from "vitest";
import { createTemplate, makeElement } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import { makeLayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import {
  findSelectableTemplateElement,
  selectionHitLabel,
} from "@/lib/report-template/editor-selection";

function baseTemplate() {
  const z = blankZonesSnapshot();
  return createTemplate({
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
}

describe("findSelectableTemplateElement (007 C)", () => {
  it("C1 正文控件", () => {
    const t = baseTemplate();
    const el = makeElement("text");
    el.id = "e1";
    t.bodyPages = [[el]];
    const hit = findSelectableTemplateElement(t, "e1");
    expect(hit?.kind).toBe("canvas");
    expect(hit?.sheet).toBe("body");
    if (hit?.kind === "canvas") expect(hit.bodyPageIndex).toBe(0);
    expect(selectionHitLabel(hit!)).toMatch(/正文/);
  });

  it("C2 封面画布 body", () => {
    const t = baseTemplate();
    t.coverLayoutPresetId = "c1";
    const el = makeElement("text");
    el.id = "cv1";
    t.coverElements = [el];
    const hit = findSelectableTemplateElement(t, "cv1");
    expect(hit?.kind).toBe("canvas");
    expect(hit?.sheet).toBe("cover");
  });

  it("C3 页眉控件", () => {
    const t = baseTemplate();
    const h = makeLayoutZoneElement("parameter");
    h.id = "h1";
    h.text = "页眉参数";
    t.headerElements = [h];
    const hit = findSelectableTemplateElement(t, "h1");
    expect(hit).not.toBeNull();
    expect(hit?.kind).toBe("zone");
    if (hit?.kind === "zone") {
      expect(hit.zone).toBe("header");
      expect(hit.element.id).toBe("h1");
    }
    expect(selectionHitLabel(hit!)).toMatch(/页眉/);
  });

  it("C4 页脚 / 装饰层", () => {
    const t = baseTemplate();
    const f = makeLayoutZoneElement("text");
    f.id = "f1";
    t.footerElements = [f];
    expect(findSelectableTemplateElement(t, "f1")?.kind).toBe("zone");

    t.coverLayoutPresetId = "c1";
    const d = makeLayoutZoneElement("text");
    d.id = "d1";
    t.coverBodyZoneElements = [d];
    const hit = findSelectableTemplateElement(t, "d1");
    expect(hit?.kind).toBe("zone");
    if (hit?.kind === "zone") expect(hit.zone).toBe("bodyDecor");
  });

  it("C5 不存在的 id", () => {
    const t = baseTemplate();
    expect(findSelectableTemplateElement(t, "nope")).toBeNull();
    expect(findSelectableTemplateElement(t, "")).toBeNull();
    expect(findSelectableTemplateElement(null, "e1")).toBeNull();
  });
});
