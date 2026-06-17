import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSavedOpcStringValue } from "@/lib/opcua-string-variables";
import { defaultReportGeneratorPrefs, type ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import { resolveAutoExportDir } from "./resolve-auto-export-dir";

vi.mock("@/lib/opcua-string-variables", () => ({
  coerceOpcFileNameString: (value: unknown) => (typeof value === "string" ? value.trim() : ""),
  readSavedOpcStringValue: vi.fn(),
}));

const readOpcString = vi.mocked(readSavedOpcStringValue);

function prefs(overrides: Partial<ReportGeneratorPrefs> = {}): ReportGeneratorPrefs {
  return {
    ...defaultReportGeneratorPrefs(),
    ...overrides,
  };
}

describe("resolveAutoExportDir", () => {
  beforeEach(() => {
    readOpcString.mockReset();
  });

  it("uses the default directory when OPC UA directory mode is off", async () => {
    await expect(resolveAutoExportDir(prefs({ autoExportDir: "C:/report" }))).resolves.toMatchObject({
      dir: "C:/report",
      source: "default",
    });
  });

  it("appends a valid OPC UA directory segment to the fallback directory", async () => {
    readOpcString.mockResolvedValue({ ok: true, value: "SCP17", dataType: "String" });

    await expect(
      resolveAutoExportDir(
        prefs({
          autoExportDirSource: "opcua",
          autoExportDir: "C:/report",
          autoExportDirOpcServerId: "srv1",
          autoExportDirOpcNodeId: "ns=2;s=dir",
        }),
      ),
    ).resolves.toMatchObject({
      dir: "C:/report/SCP17",
      source: "opcua",
    });
  });

  it("keeps Windows separators when the fallback directory uses backslashes", async () => {
    readOpcString.mockResolvedValue({ ok: true, value: "SCP17", dataType: "String" });

    await expect(
      resolveAutoExportDir(
        prefs({
          autoExportDirSource: "opcua",
          autoExportDir: "C:\\report\\",
          autoExportDirOpcServerId: "srv1",
          autoExportDirOpcNodeId: "ns=2;s=dir",
        }),
      ),
    ).resolves.toMatchObject({
      dir: "C:\\report\\SCP17",
      source: "opcua",
    });
  });

  it.each(["", "SCP/17", "SCP\\17", "..", "CON", "bad:name", "trail."])(
    "falls back when the OPC UA directory segment is invalid: %s",
    async (value) => {
      readOpcString.mockResolvedValue({ ok: true, value, dataType: "String" });

      await expect(
        resolveAutoExportDir(
          prefs({
            autoExportDirSource: "opcua",
            autoExportDir: "C:/report",
            autoExportDirOpcServerId: "srv1",
            autoExportDirOpcNodeId: "ns=2;s=dir",
          }),
        ),
      ).resolves.toMatchObject({
        dir: "C:/report",
        source: "opcua-fallback",
      });
    },
  );

  it("falls back when reading the OPC UA directory variable fails", async () => {
    readOpcString.mockResolvedValue({ ok: false, message: "read failed" });

    await expect(
      resolveAutoExportDir(
        prefs({
          autoExportDirSource: "opcua",
          autoExportDir: "C:/report",
          autoExportDirOpcServerId: "srv1",
          autoExportDirOpcNodeId: "ns=2;s=dir",
        }),
      ),
    ).resolves.toMatchObject({
      dir: "C:/report",
      source: "opcua-fallback",
    });
  });
});
