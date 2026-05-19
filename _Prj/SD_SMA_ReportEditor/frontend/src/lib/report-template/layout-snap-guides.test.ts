import { describe, expect, it } from "vitest";
import { LAYOUT_SNAP_THRESHOLD_PX, magneticSnapTranslate } from "@/lib/report-template/layout-snap-guides";

describe("magneticSnapTranslate", () => {
  it("snaps within threshold to nearest alignment target", () => {
    const peers = [{ id: "a", x: 0, y: 0, w: 100, h: 20 }];
    const r = magneticSnapTranslate(102, 5, 40, 20, 500, 400, peers, "me", LAYOUT_SNAP_THRESHOLD_PX);
    expect(r.x).toBe(100);
  });

  it("does not snap when farther than threshold", () => {
    const peers = [{ id: "a", x: 0, y: 0, w: 100, h: 20 }];
    const r = magneticSnapTranslate(90, 5, 40, 20, 500, 400, peers, "me", LAYOUT_SNAP_THRESHOLD_PX);
    expect(r.x).toBe(90);
  });
});
