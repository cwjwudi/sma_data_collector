import { describe, expect, it } from "vitest";
import {
  AUTO_EXPORT_STATUS,
  autoExportStatusLabel,
  clampAutoExportMaxParallel,
} from "@/lib/auto-export-status-codes";
import {
  defaultBindingExportResultOpcFeedback,
  importReportGeneratorPrefsFromExport,
  loadReportGeneratorPrefs,
  resolveExportResultOpcForBinding,
} from "@/lib/report-generator-prefs";
import { createAutoTriggerBinding } from "@/lib/auto-trigger-bindings";
import { beforeEach, vi } from "vitest";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

describe("auto-export-status-codes", () => {
  it("clamps parallel limit to 1..16", () => {
    expect(clampAutoExportMaxParallel(0)).toBe(1);
    expect(clampAutoExportMaxParallel(4)).toBe(4);
    expect(clampAutoExportMaxParallel(99)).toBe(16);
    expect(clampAutoExportMaxParallel("x")).toBe(4);
  });

  it("labels known status codes", () => {
    expect(autoExportStatusLabel(AUTO_EXPORT_STATUS.QUEUED)).toContain("排队");
    expect(autoExportStatusLabel(AUTO_EXPORT_STATUS.READING)).toContain("读取");
  });
});

describe("resolveExportResultOpcForBinding", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  it("prefers binding-local feedback over template/default", () => {
    importReportGeneratorPrefsFromExport({
      exportResultOpc: {
        enabled: true,
        serverId: "srv-default",
        statusNodeId: "ns=1;s=default",
        statusKind: "int",
      },
      auto: {
        enabled: true,
        maxParallelExports: 3,
        bindings: [
          {
            id: "b1",
            enabled: true,
            templateId: "tpl",
            serverId: "srv",
            nodeId: "ns=1;s=trig",
            mode: "rising",
            exportResultOpc: {
              enabled: true,
              serverId: "srv-bind",
              statusNodeId: "ns=1;s=bind_status",
              statusKind: "int",
            },
          },
        ],
      },
    });
    const prefs = loadReportGeneratorPrefs();
    expect(prefs.auto.maxParallelExports).toBe(3);
    const b = prefs.auto.bindings[0];
    const fb = resolveExportResultOpcForBinding(prefs, b);
    expect(fb.serverId).toBe("srv-bind");
    expect(fb.statusNodeId).toBe("ns=1;s=bind_status");
  });

  it("falls back to default when binding has no feedback", () => {
    importReportGeneratorPrefsFromExport({
      exportResultOpc: {
        enabled: true,
        serverId: "srv-default",
        statusNodeId: "ns=1;s=default",
        statusKind: "bool",
      },
      auto: {
        bindings: [createAutoTriggerBinding({ id: "b2", templateId: "t", serverId: "s", nodeId: "n" })],
      },
    });
    const prefs = loadReportGeneratorPrefs();
    const fb = resolveExportResultOpcForBinding(prefs, prefs.auto.bindings[0]);
    expect(fb.serverId).toBe("srv-default");
  });

  it("default binding feedback uses int statusKind", () => {
    expect(defaultBindingExportResultOpcFeedback().statusKind).toBe("int");
  });
});
