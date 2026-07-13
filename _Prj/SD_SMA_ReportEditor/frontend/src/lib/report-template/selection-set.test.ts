import { describe, expect, it } from "vitest";
import {
  applyMarqueeSelection,
  clearSelection,
  marqueeHitTest,
  primaryId,
  rangeSelectInList,
  selectOnly,
  toggleInSelection,
} from "./selection-set";

describe("selection-set (011 A)", () => {
  it("A1: toggle add/remove", () => {
    expect(toggleInSelection([], "a")).toEqual(["a"]);
    expect(toggleInSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleInSelection(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleInSelection(["b"], "b")).toEqual([]);
  });

  it("A2: range in ordered list", () => {
    const ids = ["a", "b", "c", "d"];
    expect(rangeSelectInList(ids, "a", "c")).toEqual(["a", "b", "c"]);
    expect(rangeSelectInList(ids, "c", "a")).toEqual(["a", "b", "c"]);
    expect(rangeSelectInList(ids, null, "b")).toEqual(["b"]);
  });

  it("A3: marquee AABB intersect", () => {
    const items = [
      { id: "1", x: 0, y: 0, w: 10, h: 10 },
      { id: "2", x: 20, y: 0, w: 10, h: 10 },
      { id: "3", x: 5, y: 5, w: 10, h: 10 },
    ];
    expect(marqueeHitTest(items, { x: 0, y: 0, w: 12, h: 12 }).sort()).toEqual(["1", "3"]);
    expect(marqueeHitTest(items, { x: 100, y: 100, w: 5, h: 5 })).toEqual([]);
  });

  it("A4: primary = last; clear", () => {
    expect(primaryId(["a", "b", "c"])).toBe("c");
    expect(primaryId([])).toBe(null);
    expect(clearSelection()).toEqual([]);
    expect(selectOnly("x")).toEqual(["x"]);
  });

  it("marquee apply replace vs additive", () => {
    expect(applyMarqueeSelection(["a"], ["b", "c"], false)).toEqual(["b", "c"]);
    expect(applyMarqueeSelection(["a"], ["b", "c"], true)).toEqual(["a", "b", "c"]);
    expect(applyMarqueeSelection(["a", "b"], ["b"], true)).toEqual(["a", "b"]);
  });
});
