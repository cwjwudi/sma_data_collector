import { describe, expect, it } from "vitest";
import {
  canAlign,
  canDistribute,
  computeAlignPatches,
  computeDistributePatches,
} from "./selection-align";

describe("selection-align (011 B2)", () => {
  const boxes = [
    { id: "a", x: 10, y: 10, w: 20, h: 10 },
    { id: "b", x: 50, y: 30, w: 20, h: 10 },
    { id: "c", x: 100, y: 50, w: 20, h: 10 },
  ];

  it("L: left align to primary", () => {
    const patches = computeAlignPatches(boxes, "left", "a");
    expect(patches.find((p) => p.id === "b")).toEqual({ id: "b", x: 10, y: 30 });
    expect(patches.find((p) => p.id === "c")).toEqual({ id: "c", x: 10, y: 50 });
    expect(patches.find((p) => p.id === "a")).toBeUndefined();
  });

  it("L: centerH without primary uses union", () => {
    const two = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 90, y: 0, w: 10, h: 10 },
    ];
    // union 0..100, center 50 → a.x=45, b.x=45
    const patches = computeAlignPatches(two, "centerH", null);
    expect(patches.find((p) => p.id === "a")?.x).toBe(45);
    expect(patches.find((p) => p.id === "b")?.x).toBe(45);
  });

  it("L: disabled under 2", () => {
    expect(canAlign(1)).toBe(false);
    expect(computeAlignPatches([boxes[0]], "left", "a")).toEqual([]);
  });

  it("D: horizontal distribute keeps ends", () => {
    const three = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 20, y: 0, w: 10, h: 10 },
      { id: "c", x: 90, y: 0, w: 10, h: 10 },
    ];
    // span 0..100, sumW=30, gap=(100-30)/2=35 → a@0, b@45, c@90
    const patches = computeDistributePatches(three, "horizontal");
    expect(patches.find((p) => p.id === "b")).toEqual({ id: "b", x: 45, y: 0 });
    expect(patches.find((p) => p.id === "a")).toBeUndefined();
    expect(patches.find((p) => p.id === "c")).toBeUndefined();
  });

  it("D: vertical distribute", () => {
    const three = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 0, y: 20, w: 10, h: 10 },
      { id: "c", x: 0, y: 90, w: 10, h: 10 },
    ];
    const patches = computeDistributePatches(three, "vertical");
    expect(patches.find((p) => p.id === "b")?.y).toBe(45);
  });

  it("D: disabled under 3", () => {
    expect(canDistribute(2)).toBe(false);
    expect(computeDistributePatches(boxes.slice(0, 2), "horizontal")).toEqual([]);
  });
});
