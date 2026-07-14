import { describe, expect, it } from "vitest";
import {
  applyBatchField,
  canShowBindingSection,
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
    bindingKind: "none",
    opcuaNodeId: "",
    sqlText: "",
    text: "",
    ...partial,
  };
}

describe("selection-batch-props (011 B3 + 018)", () => {
  it("I1: two template text → appearance + display + binding", () => {
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
      "text",
      "decimalPlaces",
      "nullDisplayMode",
      "bindingKind",
      "opcuaNodeId",
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
    expect(keys).toContain("bindingKind");
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

  it("read mixed bindings does not require apply", () => {
    const a = el({ type: "text", bindingKind: "opcua", opcuaNodeId: "ns=1" });
    const b = el({ type: "text", bindingKind: "opcua", opcuaNodeId: "ns=2" });
    expect(readBatchField([a, b], "opcuaNodeId")).toEqual({ kind: "mixed" });
    expect(readBatchField([a, b], "bindingKind")).toEqual({ kind: "uniform", value: "opcua" });
    expect(a.opcuaNodeId).toBe("ns=1");
    expect(b.opcuaNodeId).toBe("ns=2");
  });

  it("apply bindingKind does not clear opcuaNodeId", () => {
    const a = el({ type: "text", bindingKind: "opcua", opcuaNodeId: "ns=1" });
    const b = el({ type: "text", bindingKind: "none", opcuaNodeId: "ns=2" });
    applyBatchField([a, b], "bindingKind", "opcua");
    expect(a.opcuaNodeId).toBe("ns=1");
    expect(b.opcuaNodeId).toBe("ns=2");
    expect(a.bindingKind).toBe("opcua");
    expect(b.bindingKind).toBe("opcua");
  });

  it("text+parameter → no binding section keys", () => {
    expect(canShowBindingSection([el({ type: "text" }), el({ type: "parameter" })], "template")).toBe(
      false,
    );
    const keys = intersectBatchFields(
      [el({ type: "text" }), el({ type: "parameter" })],
      "template",
    );
    expect(keys).not.toContain("bindingKind");
    expect(keys).not.toContain("opcuaNodeId");
    expect(keys).not.toContain("sqlText");
  });

  it("two parameter → sqlText in keys", () => {
    const keys = intersectBatchFields(
      [el({ type: "parameter" }), el({ type: "parameter" })],
      "template",
    );
    expect(keys).toContain("sqlText");
    expect(keys).toContain("bindingKind");
    expect(keys).toContain("opcuaNodeId");
  });

  it("decimalPlaces clear with empty string", () => {
    const a = el({ type: "text", decimalPlaces: 2 });
    const b = el({ type: "text", decimalPlaces: 3 });
    applyBatchField([a, b], "decimalPlaces", "");
    expect(a.decimalPlaces).toBeUndefined();
    expect(b.decimalPlaces).toBeUndefined();

    const c = el({ type: "text" });
    const d = el({ type: "text" });
    expect(readBatchField([c, d], "decimalPlaces")).toEqual({ kind: "uniform", value: "" });
  });

  it("dateFormat for two dates", () => {
    const keys = intersectBatchFields([el({ type: "date" }), el({ type: "date" })], "template");
    expect(keys).toContain("dateFormat");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("bindingKind");

    const a = el({ type: "date", dateFormat: "yyyy-MM-dd" });
    const b = el({ type: "date", dateFormat: "HH:mm:ss" });
    expect(readBatchField([a, b], "dateFormat").kind).toBe("mixed");
    applyBatchField([a, b], "dateFormat", "yyyy-MM-dd");
    expect(a.dateFormat).toBe("yyyy-MM-dd");
    expect(b.dateFormat).toBe("yyyy-MM-dd");
  });
});
