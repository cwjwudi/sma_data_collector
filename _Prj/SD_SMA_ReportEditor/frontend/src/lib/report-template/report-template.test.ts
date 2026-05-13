import { describe, expect, it } from "vitest";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import { defaultBlankLayoutSnapshot } from "@/lib/report-template/layout-model";
import {
  clampElementToLayout,
  computeFingerprints,
} from "@/lib/report-template/snapshot-fingerprint";
import {
  hydrateTemplateElement,
  createTemplate,
} from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";

describe("computePaperLayout", () => {
  it("computes sane A4 portrait content rect", () => {
    const m = computePaperLayout("A4", "portrait", defaultBlankLayoutSnapshot());
    expect(m.pageW).toBeGreaterThan(600);
    expect(m.contentW).toBeGreaterThan(40);
    expect(m.contentH).toBeGreaterThan(40);
    expect(m.contentLeft).toBe(m.ml);
    expect(m.contentTop).toBeGreaterThanOrEqual(m.mt);
  });

  it("landscape swaps page dimensions versus portrait", () => {
    const p = computePaperLayout("A4", "portrait", defaultBlankLayoutSnapshot());
    const l = computePaperLayout("A4", "landscape", defaultBlankLayoutSnapshot());
    expect(p.pageW).toBeLessThan(p.pageH);
    expect(l.pageW).toBeGreaterThan(l.pageH);
  });
});

describe("hydrateTemplateElement", () => {
  it("fills binding defaults when migrating legacy shapes", () => {
    const el = hydrateTemplateElement({
      id: "a",
      type: "parameter",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      text: "x",
    });
    expect(el.bindingKind).toBe("none");
    expect(el.opcuaNodeId).toBe("");
  });
});

describe("clampElementToLayout", () => {
  it("keeps rect inside bounds", () => {
    const el = hydrateTemplateElement({ type: "text" });
    el.x = 1000;
    el.w = 500;
    clampElementToLayout(el, 200, 100);
    expect(el.x + el.w).toBeLessThanOrEqual(200);
    expect(el.y + el.h).toBeLessThanOrEqual(100);
  });
});

describe("computeFingerprints", () => {
  it("changes fingerprint when sheet content changes", () => {
    const b = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
      paperKind: "A4",
      orientation: "portrait",
      layoutPresetId: null,
      layoutSnapshot: b.layoutSnapshot,
      headerText: "",
      footerText: "",
      headerElements: [],
      footerElements: [],
      coverLayoutPresetId: null,
      coverLayoutSnapshot: b.layoutSnapshot,
      coverHeaderText: "",
      coverFooterText: "",
      coverHeaderElements: [],
      coverFooterElements: [],
      coverBodyZoneElements: [],
      backLayoutPresetId: null,
      backLayoutSnapshot: b.layoutSnapshot,
      backHeaderText: "",
      backFooterText: "",
      backHeaderElements: [],
      backFooterElements: [],
      backBodyZoneElements: [],
    });
    const a = computeFingerprints(t).body;
    t.elements.push(hydrateTemplateElement({ type: "text", text: "hi" }));
    const b_fp = computeFingerprints(t).body;
    expect(a).not.toBe(b_fp);
  });
});
