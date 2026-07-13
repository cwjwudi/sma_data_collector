import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPendingMirrorFromBackend } from "./client-prefs-mirror";
import { ASSETS_CHANGED_EVENT, DATASOURCE_CHANGED_EVENT } from "./datasource-sync-events";

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

describe("applyPendingMirrorFromBackend · assets（复制模版/版式）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pending_apply + assets 时派发 report-editor-assets-changed（reason=copy_template）", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: true,
      ui_reload: { assets: true, reason: "copy_template" },
    });
    const ev = spy.mock.calls
      .map((c) => c[0] as Event)
      .find((e) => e.type === ASSETS_CHANGED_EVENT) as CustomEvent | undefined;
    expect(ev).toBeTruthy();
    expect(ev?.detail).toMatchObject({ reason: "copy_template" });
  });

  it("pending_apply + assets 时派发 reason=copy_layout_preset", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: true,
      ui_reload: { assets: true, reason: "copy_layout_preset" },
    });
    const ev = spy.mock.calls
      .map((c) => c[0] as Event)
      .find((e) => e.type === ASSETS_CHANGED_EVENT) as CustomEvent | undefined;
    expect(ev).toBeTruthy();
    expect(ev?.detail).toMatchObject({ reason: "copy_layout_preset" });
  });

  it("无 pending_apply 时即使 assets=true 也不派发资产事件", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: false,
      ui_reload: { assets: true, reason: "copy_template" },
    });
    const types = spy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain(ASSETS_CHANGED_EVENT);
  });

  it("仅 assets 时不派发 datasource 变更事件", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    applyPendingMirrorFromBackend({
      pending_apply: true,
      ui_reload: { assets: true, reason: "copy_template" },
    });
    const types = spy.mock.calls.map((c) => (c[0] as Event).type);
    expect(types).not.toContain(DATASOURCE_CHANGED_EVENT);
  });
});
