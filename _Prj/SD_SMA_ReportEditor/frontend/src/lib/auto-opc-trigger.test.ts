import { describe, expect, it } from "vitest";
import { createOpcTriggerPollState, evaluateAutoOpcTrigger } from "@/lib/auto-opc-trigger";

describe("evaluateAutoOpcTrigger", () => {
  it("rising: first sample never fires", () => {
    const st = createOpcTriggerPollState();
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(false);
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(false);
  });

  it("rising: detects false to true", () => {
    const st = createOpcTriggerPollState();
    evaluateAutoOpcTrigger("rising", false, "", st);
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(true);
    expect(evaluateAutoOpcTrigger("rising", true, "", st)).toBe(false);
  });

  it("equals: trims text", () => {
    const st = createOpcTriggerPollState();
    expect(evaluateAutoOpcTrigger("equals", "  OK ", "OK", st)).toBe(true);
  });
});
