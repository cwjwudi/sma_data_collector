import { describe, expect, it } from "vitest";
import {
  pageOffset,
  segmentsForDepth,
  shouldApplyScanGeneration,
} from "./report-history-nav";

describe("report-history-nav (010 B)", () => {
  it("B1/B2: breadcrumb depth → segments", () => {
    const segs = ["2026-07", "morning"];
    expect(segmentsForDepth(segs, -1)).toEqual([]);
    expect(segmentsForDepth(segs, 0)).toEqual(["2026-07"]);
    expect(segmentsForDepth(segs, 1)).toEqual(["2026-07", "morning"]);
  });

  it("B3: page offset only for current page", () => {
    expect(pageOffset(0, 50)).toBe(0);
    expect(pageOffset(2, 50)).toBe(100);
  });

  it("B4: stale generation discarded", () => {
    expect(shouldApplyScanGeneration(3, 3)).toBe(true);
    expect(shouldApplyScanGeneration(2, 3)).toBe(false);
  });
});
