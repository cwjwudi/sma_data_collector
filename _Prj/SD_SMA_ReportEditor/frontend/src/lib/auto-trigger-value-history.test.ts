import { describe, expect, it } from "vitest";
import {
  AUTO_TRIGGER_CHART_MAX_SAMPLES,
  coerceOpcTriggerNumericSample,
  isOpcTriggerChartEligible,
  NumericSampleRing,
} from "@/lib/auto-trigger-value-history";

describe("isOpcTriggerChartEligible", () => {
  it("rejects String type", () => {
    expect(isOpcTriggerChartEligible("String")).toBe(false);
    expect(isOpcTriggerChartEligible("VariantType.String")).toBe(false);
  });

  it("accepts numeric types", () => {
    expect(isOpcTriggerChartEligible("Double")).toBe(true);
    expect(isOpcTriggerChartEligible("Int32")).toBe(true);
  });
});

describe("coerceOpcTriggerNumericSample", () => {
  it("returns null for String type regardless of value", () => {
    expect(coerceOpcTriggerNumericSample("42", "String")).toBeNull();
  });

  it("coerces numbers and booleans", () => {
    expect(coerceOpcTriggerNumericSample(3.5, "Double")).toBe(3.5);
    expect(coerceOpcTriggerNumericSample(true, "Boolean")).toBe(1);
  });
});

describe("NumericSampleRing", () => {
  it("caps at max samples", () => {
    const ring = new NumericSampleRing(3);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    ring.push(4);
    expect(ring.toArray()).toEqual([2, 3, 4]);
    expect(AUTO_TRIGGER_CHART_MAX_SAMPLES).toBe(3000);
  });
});
