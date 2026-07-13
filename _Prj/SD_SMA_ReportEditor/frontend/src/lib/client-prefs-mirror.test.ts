import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPendingMirrorFromBackend } from "./client-prefs-mirror";

describe("applyPendingMirrorFromBackend · connection_probe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pending_apply + connection_probe 时派发 report-editor-connection-probe-changed（via=ai）", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: true,
      ui_reload: { connection_probe: true, reason: "ai.update_connection_probe_settings" },
    });
    const probeEv = spy.mock.calls
      .map((c) => c[0] as Event)
      .find((e) => e.type === "report-editor-connection-probe-changed") as CustomEvent | undefined;
    expect(probeEv).toBeTruthy();
    expect(probeEv?.detail).toMatchObject({
      via: "ai",
      reason: "ai.update_connection_probe_settings",
    });
  });

  it("无 pending_apply 时不派发探活事件", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: false,
      ui_reload: { connection_probe: true },
    });
    const types = spy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain("report-editor-connection-probe-changed");
  });

  it("仅 assets/datasource reload 时不派发探活事件", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: true,
      ui_reload: { assets: true, datasource: true, reason: "other" },
    });
    const types = spy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain("report-editor-connection-probe-changed");
  });
});
