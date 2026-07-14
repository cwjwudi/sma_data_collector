import { afterEach, describe, expect, it } from "vitest";
import {
  clearLanAiAgentToken,
  getLanAiAgentToken,
  isLanAiProtectedApiPath,
  isPageOnLoopback,
  lanAiAuthHeaders,
  needsRemoteAiAuth,
  setLanAiAgentToken,
} from "./runtimeEnv";

describe("runtimeEnv", () => {
  afterEach(() => {
    clearLanAiAgentToken();
  });

  it("detects loopback hostnames", () => {
    // jsdom location is usually localhost
    expect(isPageOnLoopback()).toBe(true);
    expect(needsRemoteAiAuth()).toBe(false);
  });

  it("stores lan token in sessionStorage", () => {
    setLanAiAgentToken(" abc ");
    expect(getLanAiAgentToken()).toBe("abc");
    expect(lanAiAuthHeaders()).toEqual({}); // loopback → 不带头
  });

  it("marks ai api paths", () => {
    expect(isLanAiProtectedApiPath("/settings/ai/chat")).toBe(true);
    expect(isLanAiProtectedApiPath("settings/ai/pending_prompts")).toBe(true);
    expect(isLanAiProtectedApiPath("/settings/client_prefs/mirror")).toBe(true);
    expect(isLanAiProtectedApiPath("/templates")).toBe(false);
  });
});
