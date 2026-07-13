import { describe, expect, it } from "vitest";

import {
  LOCK_THUMB,
  LOCK_THUMB_PAD,
  LOCK_THUMB_TRAVEL,
  LOCK_TRACK_W,
  clampPct,
  fillWidthPx,
  pctFromClientX,
  thumbOffsetPx,
} from "./datasource-lock-geometry";

describe("datasource-lock-geometry", () => {
  it("clamps pct to 0..100", () => {
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(50)).toBe(50);
    expect(clampPct(120)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(0);
  });

  it("thumb sits at pad when unlocked (0%) and at far end when locked (100%)", () => {
    expect(thumbOffsetPx(0)).toBe(LOCK_THUMB_PAD);
    expect(thumbOffsetPx(100)).toBe(LOCK_THUMB_PAD + LOCK_THUMB_TRAVEL);
    expect(thumbOffsetPx(100) + LOCK_THUMB).toBeLessThanOrEqual(LOCK_TRACK_W);
  });

  it("fill width tracks thumb center at 0 / 50 / 100 (no full-track % drift)", () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      const thumbCenter = thumbOffsetPx(pct) + LOCK_THUMB / 2;
      expect(fillWidthPx(pct)).toBeCloseTo(thumbCenter, 6);
    }
  });

  it("pctFromClientX maps thumb-center positions back to matching pct", () => {
    const trackLeft = 100;
    for (const pct of [0, 40, 70, 100]) {
      const centerX = trackLeft + thumbOffsetPx(pct) + LOCK_THUMB / 2;
      expect(pctFromClientX(centerX, trackLeft, LOCK_TRACK_W)).toBeCloseTo(pct, 6);
    }
  });

  it("keeps fill and thumb in sync under the same pct used by drag", () => {
    const pct = pctFromClientX(100 + 40, 100, LOCK_TRACK_W);
    expect(fillWidthPx(pct)).toBe(thumbOffsetPx(pct) + LOCK_THUMB / 2);
  });
});
