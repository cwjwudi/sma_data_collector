import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  importReportGeneratorPrefsFromExport,
  loadReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";

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

describe("report generator prefs", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  it("keeps export result OPC feedback per template when importing prefs", () => {
    const ok = importReportGeneratorPrefsFromExport({
      exportResultOpc: {
        enabled: true,
        serverId: "srv-default",
        statusNodeId: "ns=1;s=default_status",
        statusKind: "int",
      },
      exportResultOpcByTemplateId: {
        tpl_a: {
          enabled: true,
          serverId: "srv-a",
          messageNodeId: "ns=1;s=a_message",
          filePathNodeId: "ns=1;s=a_path",
        },
      },
    });

    expect(ok).toBe(true);
    const prefs = loadReportGeneratorPrefs();

    expect(prefs.exportResultOpc.serverId).toBe("srv-default");
    expect(prefs.exportResultOpc.statusKind).toBe("int");
    expect(prefs.exportResultOpcByTemplateId.tpl_a.serverId).toBe("srv-a");
    expect(prefs.exportResultOpcByTemplateId.tpl_a.messageNodeId).toBe("ns=1;s=a_message");
    expect(prefs.exportResultOpcByTemplateId.tpl_a.filePathNodeId).toBe("ns=1;s=a_path");
  });

  it("migrates legacy OPC UA file name mode into selected segments", () => {
    const ok = importReportGeneratorPrefsFromExport({
      autoFileNameSource: "opcua",
      autoFileNameSegments: ["name", "hash"],
      autoFileNameOpcServerId: "srv-name",
      autoFileNameOpcNodeId: "ns=1;s=file_name",
      autoFileNameOpcAppendHash: true,
    });

    expect(ok).toBe(true);
    const prefs = loadReportGeneratorPrefs();

    expect(prefs.autoFileNameSource).toBe("segments");
    expect(prefs.autoFileNameSegments).toContain("opcua");
    expect(prefs.autoFileNameSegments.indexOf("opcua")).toBe(
      prefs.autoFileNameSegments.indexOf("name") + 1,
    );
    expect(prefs.autoFileNameSegments).toContain("hash");
    expect(prefs.autoFileNameOpcServerId).toBe("srv-name");
    expect(prefs.autoFileNameOpcNodeId).toBe("ns=1;s=file_name");
  });
});
