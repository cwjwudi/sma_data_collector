import { describe, expect, it } from "vitest";
import {
  createAutoTriggerBinding,
  isTriggerBindingActive,
  isTriggerBindingEnabled,
  normalizeAutoTriggerBinding,
} from "@/lib/auto-trigger-bindings";

describe("auto trigger binding enabled", () => {
  it("defaults enabled to true", () => {
    const b = createAutoTriggerBinding();
    expect(b.enabled).toBe(true);
    expect(isTriggerBindingEnabled(b)).toBe(true);
  });

  it("isTriggerBindingActive requires enabled and complete config", () => {
    const b = createAutoTriggerBinding({
      enabled: false,
      templateId: "t1",
      serverId: "s1",
      nodeId: "n1",
    });
    expect(isTriggerBindingActive(b)).toBe(false);
    b.enabled = true;
    expect(isTriggerBindingActive(b)).toBe(true);
  });

  it("loads enabled from persisted JSON", () => {
    const off = normalizeAutoTriggerBinding({ id: "x", enabled: false });
    expect(off?.enabled).toBe(false);
    const on = normalizeAutoTriggerBinding({ id: "y" });
    expect(on?.enabled).toBe(true);
  });
});
