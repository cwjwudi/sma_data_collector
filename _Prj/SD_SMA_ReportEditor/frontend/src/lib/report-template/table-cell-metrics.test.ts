import { describe, expect, it } from "vitest";
import {
  computeContentAwareTableRowHeightsPx,
  estimateWrappedTextHeightPx,
  estimateWrappedTextHeightUncappedPx,
  joinVisualLinesSlice,
  splitLogicalRowByAvailPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
  wrapTextToVisualLines,
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

  it("wrap 抽出后估高与直接估算一致（含硬换行）", () => {
    const text = "短行\n" + "报警描述".repeat(40);
    const direct = estimateWrappedTextHeightPx({
      text,
      widthPx: 80,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    const wrap = wrapTextToVisualLines({ text, widthPx: 80, fontSizePx: 12 });
    const viaWrap = estimateWrappedTextHeightPx({
      text: joinVisualLinesSlice(wrap, 0, wrap.lines.length),
      widthPx: 80,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    // 软折行处 join 不插 \\n，硬换行保留 → 应还原原文（规范化后）
    expect(joinVisualLinesSlice(wrap, 0, wrap.lines.length)).toBe(text.replace(/\r\n/g, "\n"));
    expect(viaWrap).toBe(direct);
  });
});

describe("splitLogicalRowByAvailPx", () => {
  it("窄列超长文案切出多段且拼接还原、每段高不超过 avail", () => {
    const text = "报警描述".repeat(80);
    const avail = 200;
    const frags = splitLogicalRowByAvailPx({
      cellTexts: [text],
      colWidthsPx: [80],
      fontSizePx: 12,
      minHeightPx: 28,
      availInnerPx: avail,
    });
    expect(frags.length).toBeGreaterThan(1);
    let joined = "";
    let covered = 0;
    for (const f of frags) {
      expect(f.heightPx).toBeLessThanOrEqual(avail);
      expect(f.lineStart).toBe(covered);
      covered = f.lineEnd;
      joined += f.cellTexts[0];
    }
    expect(covered).toBe(frags[0].totalLines);
    expect(joined).toBe(text);
  });

  it("多列以最高列为准切齐", () => {
    const tall = "报警".repeat(60);
    const frags = splitLogicalRowByAvailPx({
      cellTexts: ["短", tall],
      colWidthsPx: [120, 60],
      fontSizePx: 12,
      minHeightPx: 28,
      availInnerPx: 180,
    });
    expect(frags.length).toBeGreaterThan(1);
    const wrapTall = wrapTextToVisualLines({ text: tall, widthPx: 60, fontSizePx: 12 });
    expect(frags[0].totalLines).toBe(wrapTall.lines.length);
    expect(frags.map((f) => f.cellTexts[1]).join("")).toBe(tall);
  });

  it("avail 不足以放下 1 行文本时返回空", () => {
    const frags = splitLogicalRowByAvailPx({
      cellTexts: ["报警描述文字"],
      colWidthsPx: [80],
      fontSizePx: 12,
      minHeightPx: 28,
      availInnerPx: 10,
    });
    expect(frags).toEqual([]);
  });

  it("uncapped 估高可超过整页界", () => {
    const text = "报警描述".repeat(200);
    const capped = estimateWrappedTextHeightPx({
      text,
      widthPx: 80,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    const uncapped = estimateWrappedTextHeightUncappedPx({
      text,
      widthPx: 80,
      fontSizePx: 12,
      minHeightPx: 28,
    });
    expect(capped).toBeLessThanOrEqual(1123);
    expect(uncapped).toBeGreaterThan(capped);
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
