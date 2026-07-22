import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_BACKGROUND_CSS,
  createEmptyLayoutPreset,
  defaultBlankLayoutSnapshot,
  hydrateLayoutPreset,
  hydrateLayoutSnapshot,
  presetToSnapshot,
  resolveBodyBackgroundCss,
} from "@/lib/report-template/layout-model";

describe("bodyBackgroundCss on LayoutSnapshot / LayoutPreset", () => {
  it("defaults to historical Mini gray", () => {
    expect(defaultBlankLayoutSnapshot().bodyBackgroundCss).toBe(DEFAULT_BODY_BACKGROUND_CSS);
    expect(createEmptyLayoutPreset().bodyBackgroundCss).toBe(DEFAULT_BODY_BACKGROUND_CSS);
    expect(resolveBodyBackgroundCss({})).toBe(DEFAULT_BODY_BACKGROUND_CSS);
    expect(resolveBodyBackgroundCss({ bodyBackgroundCss: "" })).toBe(DEFAULT_BODY_BACKGROUND_CSS);
  });

  it("preserves transparent and custom colors", () => {
    expect(resolveBodyBackgroundCss({ bodyBackgroundCss: "transparent" })).toBe("transparent");
    expect(resolveBodyBackgroundCss({ bodyBackgroundCss: "#ffffff" })).toBe("#ffffff");
    expect(resolveBodyBackgroundCss({ bodyBackgroundCss: "  #eef2ff  " })).toBe("#eef2ff");
  });

  it("hydrate fills missing field; presetToSnapshot carries color", () => {
    const snap = hydrateLayoutSnapshot({ marginTopMm: 10 });
    expect(snap.marginTopMm).toBe(10);
    expect(snap.bodyBackgroundCss).toBe(DEFAULT_BODY_BACKGROUND_CSS);

    const p = hydrateLayoutPreset({
      id: "p1",
      name: "n",
      bodyBackgroundCss: "#ffffff",
    });
    expect(p.bodyBackgroundCss).toBe("#ffffff");
    expect(presetToSnapshot(p).bodyBackgroundCss).toBe("#ffffff");
  });
});
