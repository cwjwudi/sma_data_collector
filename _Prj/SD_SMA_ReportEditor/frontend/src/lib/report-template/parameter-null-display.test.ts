import { describe, expect, it } from "vitest";
import {
  formatScalarForPreviewValue,
  isBoundValueEmpty,
  resolveBoundParameterPreviewText,
  resolveParameterDisplayText,
  sqlResponseFirstScalar,
} from "@/lib/report-template/binding-preview-utils";

describe("parameter null display", () => {
  it("treats null scalar as empty string", () => {
    expect(formatScalarForPreviewValue(null)).toBe("");
    expect(formatScalarForPreviewValue(undefined)).toBe("");
  });

  it("sqlResponseFirstScalar returns empty when no rows", () => {
    expect(sqlResponseFirstScalar({ columns: ["a"], rows: [] })).toBe("");
    expect(
      sqlResponseFirstScalar({
        columns: ["InfoProductName"],
        rows: [{ InfoProductName: "" }],
      }),
    ).toBe("");
  });

  it("resolveParameterDisplayText modes", () => {
    expect(
      resolveParameterDisplayText({
        boundText: "真实值",
        hasBoundResult: true,
        mode: "blank",
        fallbackText: "{{value}}",
      }),
    ).toBe("真实值");
    expect(
      resolveParameterDisplayText({
        boundText: "",
        hasBoundResult: true,
        mode: "blank",
        fallbackText: "{{value}}",
      }),
    ).toBe("");
    expect(
      resolveParameterDisplayText({
        boundText: "",
        hasBoundResult: true,
        mode: "emptyLabel",
        fallbackText: "",
      }),
    ).toBe("空值");
    expect(
      resolveParameterDisplayText({
        boundText: "",
        hasBoundResult: true,
        mode: "fallbackText",
        fallbackText: "待填写",
      }),
    ).toBe("待填写");
  });

  it("does not fall back to {{value}} when bound text is empty", () => {
    expect(
      resolveBoundParameterPreviewText({
        bindingKind: "sql",
        text: "{{value}}",
        nullDisplayMode: "blank",
        previewCell: { text: "" },
        loading: false,
      }),
    ).toBe("");
  });

  it("preserves OPC/SQL error text", () => {
    expect(
      resolveParameterDisplayText({
        boundText: "（SQL）连接失败",
        hasBoundResult: true,
        mode: "blank",
        fallbackText: "",
      }),
    ).toBe("（SQL）连接失败");
  });

  it("isBoundValueEmpty", () => {
    expect(isBoundValueEmpty("")).toBe(true);
    expect(isBoundValueEmpty("null")).toBe(true);
    expect(isBoundValueEmpty("x")).toBe(false);
  });
});
