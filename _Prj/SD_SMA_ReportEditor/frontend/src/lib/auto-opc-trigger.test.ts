import { describe, expect, it } from "vitest";
import {
  createOpcTriggerPollState,
  evaluateAutoOpcTrigger,
  opcValueEqualsCompare,
} from "@/lib/auto-opc-trigger";

describe("opcValueEqualsCompare", () => {
  it("matches numeric and string forms", () => {
    expect(opcValueEqualsCompare(5, "5")).toBe(true);
    expect(opcValueEqualsCompare("5", "5")).toBe(true);
    expect(opcValueEqualsCompare(4, "5")).toBe(false);
  });
});

describe("evaluateAutoOpcTrigger", () => {
  it("rising: first sample only primes (no ghost trigger at app start)", () => {
    const st = createOpcTriggerPollState();
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("rising", false, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(true);
  });

  it("falling: first sample only primes", () => {
    const st = createOpcTriggerPollState();
    expect(evaluateAutoOpcTrigger("falling", false, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("falling", true, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("falling", false, "", st)).toBe(true);
  });

  it("equals: first sample only primes even when value already matches", () => {
    const st = createOpcTriggerPollState();
    expect(evaluateAutoOpcTrigger("equals", 1, "1", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("equals", 1, "1", st)).toBe(false);
  });

  it("equals: edge when value becomes equal", () => {
    const st = createOpcTriggerPollState();
    evaluateAutoOpcTrigger("equals", 0, "1", st);
    expect(evaluateAutoOpcTrigger("equals", 1, "1", st)).toBe(true);
    expect(evaluateAutoOpcTrigger("equals", 1, "1", st)).toBe(false);
  });
});
