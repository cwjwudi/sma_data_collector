import { describe, expect, it } from "vitest";
import { applySelectionClick, summarizeTransferResult } from "./history-selection";

describe("applySelectionClick", () => {
  const keys = ["a", "b", "c", "d"];

  it("单击替换选中", () => {
    const r = applySelectionClick({
      key: "b",
      orderedKeys: keys,
      selected: new Set(["a"]),
      anchorKey: "a",
      additive: false,
      range: false,
    });
    expect([...r.selected]).toEqual(["b"]);
    expect(r.anchorKey).toBe("b");
  });

  it("additive 切换", () => {
    const r = applySelectionClick({
      key: "c",
      orderedKeys: keys,
      selected: new Set(["a"]),
      anchorKey: "a",
      additive: true,
      range: false,
    });
    expect(r.selected.has("a")).toBe(true);
    expect(r.selected.has("c")).toBe(true);
  });

  it("Shift 区间", () => {
    const r = applySelectionClick({
      key: "d",
      orderedKeys: keys,
      selected: new Set(),
      anchorKey: "b",
      additive: false,
      range: true,
    });
    expect([...r.selected].sort()).toEqual(["b", "c", "d"]);
  });
});

describe("summarizeTransferResult", () => {
  it("汇总计数", () => {
    expect(
      summarizeTransferResult({ copied: 2, moved: 0, skipped: 1, failed: 0 }),
    ).toContain("复制 2");
  });
});
