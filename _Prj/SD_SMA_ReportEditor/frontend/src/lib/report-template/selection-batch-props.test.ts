import { describe, expect, it } from "vitest";
import {
  applyBatchField,
  intersectBatchFields,
  readBatchField,
  supportsBatchField,
  type BatchEl,
} from "./selection-batch-props";

function el(partial: Partial<BatchEl> & { type: string }): BatchEl {
  return {
    showBorder: true,
    bgColor: "transparent",
    color: "#18181b",
    fontSize: 14,
    fontFamily: "",
    textAutoWrap: false,
    alignX: "start",
    alignY: "center",
    ...partial,
  };
}

describe("selection-batch-props (011 B3)", () => {
  it("I1: two template text → full appearance set", () => {
    const keys = intersectBatchFields([el({ type: "text" }), el({ type: "text" })], "template");
    expect(keys).toEqual([
      "showBorder",
      "bgColor",
      "color",
      "fontSize",
      "fontFamily",
      "textAutoWrap",
      "alignX",
      "alignY",
    ]);
  });

  it("I2: text + table → no border/fill/wrap; still font metrics", () => {
    const keys = intersectBatchFields([el({ type: "text" }), el({ type: "table" })], "template");
    expect(keys).toEqual(["fontSize", "fontFamily", "alignX", "alignY"]);
    expect(supportsBatchField(el({ type: "table" }), "showBorder", "template")).toBe(false);
  });

  it("I5: layout two text → no color batch", () => {
    const keys = intersectBatchFields([el({ type: "text" }), el({ type: "text" })], "layout");
    expect(keys).not.toContain("color");
    expect(keys).toContain("showBorder");
    expect(keys).toContain("bgColor");
  });

  it("layout box → color supported", () => {
    expect(supportsBatchField(el({ type: "box" }), "color", "layout")).toBe(true);
  });

  it("M: mixed then apply showBorder", () => {
    const a = el({ type: "text", showBorder: true });
    const b = el({ type: "text", showBorder: false });
    expect(readBatchField([a, b], "showBorder")).toEqual({ kind: "mixed" });
    const n = applyBatchField([a, b], "showBorder", false);
    expect(n).toBe(1);
    expect(a.showBorder).toBe(false);
    expect(b.showBorder).toBe(false);
    expect(readBatchField([a, b], "showBorder")).toEqual({ kind: "uniform", value: false });
  });

  it("M: apply bgColor / fontSize", () => {
    const a = el({ type: "box", bgColor: "#fff", fontSize: 12 });
    const b = el({ type: "box", bgColor: "#000", fontSize: 18 });
    expect(readBatchField([a, b], "bgColor").kind).toBe("mixed");
    applyBatchField([a, b], "bgColor", "#e4e4e7");
    applyBatchField([a, b], "fontSize", 16);
    expect(a.bgColor).toBe("#e4e4e7");
    expect(b.bgColor).toBe("#e4e4e7");
    expect(a.fontSize).toBe(16);
    expect(b.fontSize).toBe(16);
  });

  it("under 2 → empty intersection", () => {
    expect(intersectBatchFields([el({ type: "text" })], "template")).toEqual([]);
  });

  it("image excluded from align", () => {
    const keys = intersectBatchFields([el({ type: "text" }), el({ type: "image" })], "template");
    expect(keys).not.toContain("alignX");
    expect(keys).not.toContain("textAutoWrap");
    expect(keys).toContain("showBorder");
    expect(keys).toContain("fontSize");
  });
});
