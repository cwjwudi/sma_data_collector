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

  it("放开单行高度上限：超长内容不再被裁到 240px，但仍以整页高度为界", () => {
    // 回归：默认上限固定 240px 会把窄列长文本静默裁断、导出丢内容。
    // 放开后应长到内容所需（远超 240），且不超过整页高度上界。
    const veryLong = "报警描述".repeat(120); // ~480 CJK 字符，窄列会折出很多行
    const h = estimateWrappedTextHeightPx({
      text: veryLong,
      widthPx: 80,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    expect(h).toBeGreaterThan(240); // 不再被 240 裁断
    expect(h).toBeLessThanOrEqual(1123); // 仍以整页(A4)高度为界，避免单行占多页
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
