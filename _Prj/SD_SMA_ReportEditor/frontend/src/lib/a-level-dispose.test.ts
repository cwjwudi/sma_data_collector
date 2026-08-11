/**
 * 034 M6 / L11：A 级服务 dispose 清 timer、解绑事件（可执行抽样）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/report-generator-prefs", () => ({
  loadReportGeneratorPrefs: () => ({
    heartbeat: {
      enabled: true,
      serverId: "s1",
      nodeId: "ns=2;s=HB",
      intervalMs: 1000,
      mode: "toggle" as const,
    },
    auto: { enabled: false, bindings: [] },
  }),
}));

vi.mock("@/lib/opcua-write", () => ({
  writeSavedOpcNodeValue: vi.fn(async () => ({ ok: true, message: "" })),
}));

describe("A-level dispose (034 L11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("disposePlcHeartbeat clears interval and listeners", async () => {
    const { initPlcHeartbeat, disposePlcHeartbeat } = await import("@/lib/plc-heartbeat-service");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    initPlcHeartbeat();
    disposePlcHeartbeat();

    expect(clearSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("report-generator-prefs-updated", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "report-generator-auto-export-changed",
      expect.any(Function),
    );
  });

  it("disposeReportAutoExportTrigger clears poll timer and listeners", async () => {
    vi.resetModules();
    vi.doMock("@/lib/report-generator-prefs", () => ({
      loadReportGeneratorPrefs: () => ({
        auto: { enabled: true, bindings: [] },
        heartbeat: { enabled: false, serverId: "", nodeId: "", intervalMs: 1000, mode: "toggle" },
      }),
      saveReportGeneratorPrefs: vi.fn(),
      resolveExportResultOpcForBinding: vi.fn(),
    }));
    // 伪装 Electron 壳，使 restartPollLoop 真正挂 interval
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { runPdfExport: vi.fn() },
    });

    const { initReportAutoExportTrigger, disposeReportAutoExportTrigger } = await import(
      "@/lib/report-auto-export-trigger-service"
    );
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    initReportAutoExportTrigger();
    disposeReportAutoExportTrigger();

    expect(clearSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(
      "report-generator-auto-export-changed",
      expect.any(Function),
    );
    expect(removeSpy).toHaveBeenCalledWith("report-editor-config-imported", expect.any(Function));

    delete (window as { electronAPI?: unknown }).electronAPI;
  });
});
