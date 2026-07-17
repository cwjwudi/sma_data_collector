import { describe, expect, it } from "vitest";
import { takeLayoutDeltaFromScreen } from "./column-resize-pointer";

describe("takeLayoutDeltaFromScreen", () => {
  it("高缩放单步不足 0.5 布局像素时不 emit，余数保留直至 round 发出", () => {
    // 2.8×：屏幕 1px → 布局 ≈0.357；旧逻辑每步 round→0 永久丢失
    const a = takeLayoutDeltaFromScreen(0, 1, 2.8);
    expect(a.emitDx).toBe(0);
    expect(a.nextAccum).toBeCloseTo(1 / 2.8, 5);

    // 第二步累到 ≈0.71 → Math.round=1，余数回写
    const b = takeLayoutDeltaFromScreen(a.nextAccum, 1, 2.8);
    expect(b.emitDx).toBe(1);
    expect(b.nextAccum).toBeCloseTo(2 / 2.8 - 1, 5);
  });

  it("scale=1 时屏幕 1px 立即 emit 1", () => {
    const r = takeLayoutDeltaFromScreen(0, 1, 1);
    expect(r.emitDx).toBe(1);
    expect(r.nextAccum).toBeCloseTo(0, 5);
  });

  it("负向拖动同样累积", () => {
    let accum = 0;
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const r = takeLayoutDeltaFromScreen(accum, -1, 2.8);
      total += r.emitDx;
      accum = r.nextAccum;
    }
    expect(total).toBeLessThanOrEqual(-1);
  });
});
