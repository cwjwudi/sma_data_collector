import { describe, expect, it } from "vitest";
import { reorderIdsBefore } from "./template-display-order";

describe("reorderIdsBefore（拖拽排序方向）", () => {
  it("从前往后拖：把 1 拖到 2，占据 2 的位置", () => {
    expect(reorderIdsBefore(["1", "2", "3"], "1", "2")).toEqual(["2", "1", "3"]);
  });

  it("从后往前拖：把 3 拖到 2，占据 2 的位置", () => {
    expect(reorderIdsBefore(["1", "2", "3"], "3", "2")).toEqual(["1", "3", "2"]);
  });

  it("跨多个：把 2 拖到 4（向后）", () => {
    expect(reorderIdsBefore(["1", "2", "3", "4", "5"], "2", "4")).toEqual([
      "1",
      "3",
      "4",
      "2",
      "5",
    ]);
  });

  it("跨多个：把 4 拖到 2（向前）", () => {
    expect(reorderIdsBefore(["1", "2", "3", "4", "5"], "4", "2")).toEqual([
      "1",
      "4",
      "2",
      "3",
      "5",
    ]);
  });

  it("拖到末尾：把 1 拖到 3", () => {
    expect(reorderIdsBefore(["1", "2", "3"], "1", "3")).toEqual(["2", "3", "1"]);
  });

  it("相同或无效目标不变", () => {
    expect(reorderIdsBefore(["1", "2", "3"], "2", "2")).toEqual(["1", "2", "3"]);
    expect(reorderIdsBefore(["1", "2", "3"], "x", "2")).toEqual(["1", "2", "3"]);
  });
});
