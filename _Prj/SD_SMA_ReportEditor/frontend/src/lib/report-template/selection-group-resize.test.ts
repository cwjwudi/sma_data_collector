import { describe, expect, it } from "vitest";
import {
  applyGroupResize,
  clampPositionOnly,
  unionAabb,
  type GroupResizeOrigin,
} from "./selection-group-resize";

function o(partial: Partial<GroupResizeOrigin> & { id: string }): GroupResizeOrigin {
  return {
    x: 0,
    y: 0,
    w: 100,
    h: 50,
    ...partial,
  };
}

describe("selection-group-resize (020)", () => {
  it("unionAabb of two boxes", () => {
    expect(
      unionAabb([
        { x: 10, y: 20, w: 40, h: 30 },
        { x: 30, y: 10, w: 50, h: 20 },
      ]),
    ).toEqual({ x: 10, y: 10, w: 70, h: 40 });
  });

  it("se corner scales both relative to AABB", () => {
    const origins = [
      o({ id: "a", x: 0, y: 0, w: 100, h: 100 }),
      o({ id: "b", x: 100, y: 100, w: 100, h: 100 }),
    ];
    // AABB 200×200; drag se +100,+100 → sx=sy=1.5
    const out = applyGroupResize(origins, "se", 100, 100);
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(byId.a).toMatchObject({ x: 0, y: 0, w: 150, h: 150 });
    expect(byId.b).toMatchObject({ x: 150, y: 150, w: 150, h: 150 });
  });

  it("shift lockAspect uses dominant axis", () => {
    const origins = [o({ id: "a", x: 0, y: 0, w: 100, h: 100 })];
    const out = applyGroupResize(origins, "se", 100, 20, { lockAspect: true });
    expect(out[0]!.w).toBe(out[0]!.h);
    expect(out[0]!.w).toBe(200); // |dx|>=|dy| → sx=2
  });

  it("table horizontalOnly keeps height", () => {
    const origins = [
      o({ id: "t", x: 0, y: 0, w: 200, h: 80, horizontalOnly: true }),
      o({ id: "a", x: 0, y: 100, w: 100, h: 40 }),
    ];
    const out = applyGroupResize(origins, "se", 200, 100);
    const t = out.find((r) => r.id === "t")!;
    const a = out.find((r) => r.id === "a")!;
    expect(t.h).toBe(80);
    expect(t.w).toBeGreaterThan(200);
    expect(a.h).toBeGreaterThan(40);
  });

  it("min size clamps global scale", () => {
    const origins = [o({ id: "a", x: 0, y: 0, w: 100, h: 100, minW: 40, minH: 40 })];
    const out = applyGroupResize(origins, "se", -90, -90);
    expect(out[0]!.w).toBeGreaterThanOrEqual(40);
    expect(out[0]!.h).toBeGreaterThanOrEqual(40);
  });

  it("e handle only scales width", () => {
    const origins = [
      o({ id: "a", x: 0, y: 10, w: 50, h: 20 }),
      o({ id: "b", x: 50, y: 10, w: 50, h: 20 }),
    ];
    const out = applyGroupResize(origins, "e", 100, 999);
    expect(out.every((r) => r.h === 20)).toBe(true);
    expect(out.find((r) => r.id === "b")!.w).toBe(100);
  });

  it("clampPositionOnly does not shrink size", () => {
    const el = { x: 900, y: 900, w: 100, h: 80 };
    clampPositionOnly(el, 500, 400);
    expect(el.w).toBe(100);
    expect(el.h).toBe(80);
    expect(el.x).toBe(400);
    expect(el.y).toBe(320);
  });
});
