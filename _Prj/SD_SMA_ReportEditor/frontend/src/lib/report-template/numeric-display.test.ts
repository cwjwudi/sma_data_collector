import { describe, expect, it } from "vitest";
import {
  applyDecimalPlacesToDisplayText,
  formatScalarForPreviewValue,
} from "@/lib/report-template/binding-preview-utils";
import { normalizeDecimalPlaces } from "@/lib/report-template/numeric-display";

describe("decimal places for REAL display", () => {
  it("normalizes decimal places to 0..10", () => {
    expect(normalizeDecimalPlaces(undefined)).toBeUndefined();
    expect(normalizeDecimalPlaces("")).toBeUndefined();
    expect(normalizeDecimalPlaces(2)).toBe(2);
    expect(normalizeDecimalPlaces(99)).toBe(10);
    expect(normalizeDecimalPlaces(-1)).toBe(0);
  });

  it("formats numbers with toFixed when configured", () => {
    expect(formatScalarForPreviewValue(3.14159, { decimalPlaces: 2 })).toBe("3.14");
    expect(formatScalarForPreviewValue("12.3456", { decimalPlaces: 1 })).toBe("12.3");
    expect(formatScalarForPreviewValue(3.14159)).toBe("3.14159");
  });

  it("applyDecimalPlacesToDisplayText leaves non-numbers alone", () => {
    expect(applyDecimalPlacesToDisplayText("空值", 2)).toBe("空值");
    expect(applyDecimalPlacesToDisplayText("（SQL）失败", 2)).toBe("（SQL）失败");
    expect(applyDecimalPlacesToDisplayText("2026-07-10 12:00:00", 2)).toBe("2026-07-10 12:00:00");
    expect(applyDecimalPlacesToDisplayText("1.2345", 2)).toBe("1.23");
  });
});
