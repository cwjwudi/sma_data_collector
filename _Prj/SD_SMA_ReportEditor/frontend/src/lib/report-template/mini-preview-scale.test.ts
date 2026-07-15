import { describe, expect, it } from "vitest";
import {
  MINI_PREVIEW_CHROME_H_INSET,
  MINI_PREVIEW_CHROME_W_INSET,
  miniPreviewScale,
  miniPreviewScaleForExport,
} from "./mini-preview-scale";
import { getPaperPageCssPx } from "./paper";

describe("miniPreviewScale (019)", () => {
  it("U1: export scale === 1 when max equals paper CSS px", () => {
    const { widthPx, heightPx } = getPaperPageCssPx("A4", "portrait");
    expect(miniPreviewScaleForExport(widthPx, heightPx, widthPx, heightPx)).toBe(1);
    expect(
      miniPreviewScale(widthPx, heightPx, widthPx, heightPx, { chromeInset: false }),
    ).toBe(1);
  });

  it("U2: list chrome inset still shrinks when max barely fits", () => {
    const { widthPx, heightPx } = getPaperPageCssPx("A4", "portrait");
    const s = miniPreviewScale(widthPx, heightPx, widthPx, heightPx);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(
      Math.min(
        (widthPx - MINI_PREVIEW_CHROME_W_INSET) / widthPx,
        (heightPx - MINI_PREVIEW_CHROME_H_INSET) / heightPx,
        1,
      ),
      6,
    );
  });
});
