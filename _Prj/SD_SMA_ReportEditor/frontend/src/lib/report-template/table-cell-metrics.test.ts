import { describe, expect, it } from "vitest";
import {
  computeContentAwareTableRowHeightsPx,
  estimateWrappedTextHeightPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
} from "./table-cell-metrics";

describe("estimateWrappedTextHeightPx", () => {
  it("returns min height for empty text", () => {
    expect(
      estimateWrappedTextHeightPx({
        text: "  ",
        widthPx: 100,
        fontSizePx: 12,
        minHeightPx: 28,
      }),
    ).toBe(28);
  });

  it("grows for wrapped Chinese text", () => {
    const short = estimateWrappedTextHeightPx({
      text: "复位",
      widthPx: 200,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    const long = estimateWrappedTextHeightPx({
      text: "2026-07-10 15:38:56 复位按钮按下后系统进入待机并等待下一次生产指令确认",
      widthPx: 160,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    expect(short).toBe(28);
    expect(long).toBeGreaterThan(28);
  });
});

describe("computeContentAwareTableRowHeightsPx", () => {
  it("uses tallest cell in each row", () => {
    const heights = computeContentAwareTableRowHeightsPx({
      rowCount: 2,
      colWidthsPx: [80, 200],
      fontSizePx: 12,
      minRowHeightPx: TABLE_ROW_HEIGHT_DEFAULT_PX,
      cellTextAt: (ri, ci) =>
        ri === 1 && ci === 1
          ? "这是一段很长的审计描述文字需要在单元格内自动换行显示完整内容"
          : "短",
    });
    expect(heights[0]).toBe(TABLE_ROW_HEIGHT_DEFAULT_PX);
    expect(heights[1]).toBeGreaterThan(TABLE_ROW_HEIGHT_DEFAULT_PX);
  });
});
