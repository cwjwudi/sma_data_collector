import { describe, expect, it } from "vitest";
import {
  buildPrintTableGridBounds,
  buildPrintTableGridHairlines,
  collectPrintTableGridAxes,
} from "./print-table-grid-overlay";

describe("print-table-grid-overlay (D21c)", () => {
  it("collects unique rounded axes across cells (incl. separator row)", () => {
    const wrap = { left: 100, top: 200, right: 300, bottom: 400 };
    const cells = [
      { left: 100, top: 200, right: 180, bottom: 220 },
      { left: 180, top: 200, right: 300, bottom: 220 },
      { left: 100, top: 220, right: 180, bottom: 240 },
      { left: 180, top: 220, right: 300, bottom: 240 },
      { left: 100, top: 240, right: 180, bottom: 260 },
      { left: 180, top: 240, right: 300, bottom: 260 },
    ];
    const { xs, ys } = collectPrintTableGridAxes(wrap, cells);
    expect(xs).toEqual([0, 80, 200]);
    expect(ys).toEqual([0, 20, 40, 60]);
  });

  it("builds continuous full-span axes bounds", () => {
    const b = buildPrintTableGridBounds([0, 80, 200], [0, 20, 40, 60]);
    expect(b).toMatchObject({ left: 0, top: 0, width: 200, height: 60 });
    const lines = buildPrintTableGridHairlines([0, 80, 200], [0, 20, 40, 60]);
    expect(lines).toHaveLength(7);
    expect(lines!.find((l) => l.left === 80 && l.width === 1)?.height).toBe(60);
  });

  it("returns null when axes insufficient", () => {
    expect(buildPrintTableGridBounds([0], [0, 1])).toBeNull();
    expect(buildPrintTableGridHairlines([0, 1], [0])).toBeNull();
  });
});
