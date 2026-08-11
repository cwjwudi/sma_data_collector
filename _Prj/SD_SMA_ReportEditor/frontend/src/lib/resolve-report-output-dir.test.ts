import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSavedOpcStringValue } from "@/lib/opcua-string-variables";
import { defaultReportGeneratorPrefs, type ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import {
  isAbsoluteLocalDir,
  normalizeBatchDirSegment,
  resolveReportOutputTarget,
} from "./resolve-report-output-dir";

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

describe("isAbsoluteLocalDir", () => {
  it.each(["D:\\Reports\\Daily", "C:/report", "\\\\nas\\share\\daily", "/opt/reports"])(
    "accepts absolute path: %s",
    (p) => {
      expect(isAbsoluteLocalDir(p)).toBe(true);
    },
  );

  it.each(["", "  ", "Daily", "reports/daily", "..\\daily", "./daily"])(
    "rejects relative or empty path: %s",
    (p) => {
      expect(isAbsoluteLocalDir(p)).toBe(false);
    },
  );
});

describe("resolveReportOutputTarget · nonBatch（Q2A/Q8B）", () => {
  it("uses the template absolute directory as-is", async () => {
    await expect(
      resolveReportOutputTarget({
        reportKind: "nonBatch",
        nonBatchOutputDir: "D:\\Reports\\Daily",
        prefs: prefs(),
      }),
    ).resolves.toMatchObject({ ok: true, kind: "nonBatch", dir: "D:\\Reports\\Daily" });
  });

  it("fails when the directory is not configured", async () => {
    const res = await resolveReportOutputTarget({
      reportKind: "nonBatch",
      nonBatchOutputDir: "",
      prefs: prefs(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("目标文件夹");
  });

  it("fails when the directory is a relative path", async () => {
    const res = await resolveReportOutputTarget({
      reportKind: "nonBatch",
      nonBatchOutputDir: "Daily",
      prefs: prefs(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("绝对路径");
  });

  it("never reads OPC variables for nonBatch templates", async () => {
    readOpcString.mockReset();
    await resolveReportOutputTarget({
      reportKind: "nonBatch",
      nonBatchOutputDir: "/opt/reports",
      prefs: prefs({
        autoFileNameOpcServerId: "srv1",
        autoFileNameOpcNodeId: "ns=2;s=batch",
      }),
    });
    expect(readOpcString).not.toHaveBeenCalled();
  });
});

describe("resolveReportOutputTarget · batch（Q5A/Q9C）", () => {
  beforeEach(() => {
    readOpcString.mockReset();
  });

  it("builds root/<batchNo> from the fileName OPC binding first", async () => {
    readOpcString.mockResolvedValue({ ok: true, value: "SCP17", dataType: "String" });

    await expect(
      resolveReportOutputTarget({
        reportKind: "batch",
        prefs: prefs({
          autoExportDir: "C:/report",
          autoFileNameOpcServerId: "srv1",
          autoFileNameOpcNodeId: "ns=2;s=batch",
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      kind: "batch",
      dir: "C:/report/SCP17",
      batchNo: "SCP17",
      batchNoSource: "fileName",
    });
    expect(readOpcString).toHaveBeenCalledTimes(1);
    expect(readOpcString).toHaveBeenCalledWith("srv1", "ns=2;s=batch");
  });

  it("keeps Windows separators when the root uses backslashes", async () => {
    readOpcString.mockResolvedValue({ ok: true, value: "SCP17", dataType: "String" });

    await expect(
      resolveReportOutputTarget({
        reportKind: "batch",
        prefs: prefs({
          autoExportDir: "C:\\report\\",
          autoExportDirOpcServerId: "srv1",
          autoExportDirOpcNodeId: "ns=2;s=dir",
        }),
      }),
    ).resolves.toMatchObject({ ok: true, dir: "C:\\report\\SCP17", batchNoSource: "exportDir" });
  });

  it("falls through to the exportDir OPC binding when the fileName value is invalid", async () => {
    readOpcString
      .mockResolvedValueOnce({ ok: true, value: "", dataType: "String" })
      .mockResolvedValueOnce({ ok: true, value: "B123", dataType: "String" });

    await expect(
      resolveReportOutputTarget({
        reportKind: "batch",
        prefs: prefs({
          autoExportDir: "C:/report",
          autoFileNameOpcServerId: "srv1",
          autoFileNameOpcNodeId: "ns=2;s=batch",
          autoExportDirOpcServerId: "srv1",
          autoExportDirOpcNodeId: "ns=2;s=dir",
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      dir: "C:/report/B123",
      batchNo: "B123",
      batchNoSource: "exportDir",
    });
  });

  it("fails without silent fallback when no binding yields a valid batch number", async () => {
    readOpcString.mockResolvedValue({ ok: false, message: "read failed" });

    const res = await resolveReportOutputTarget({
      reportKind: "batch",
      prefs: prefs({
        autoExportDir: "C:/report",
        autoFileNameOpcServerId: "srv1",
        autoFileNameOpcNodeId: "ns=2;s=batch",
        autoExportDirOpcServerId: "srv1",
        autoExportDirOpcNodeId: "ns=2;s=dir",
      }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("无有效批号");
  });

  it("fails when no batch-number OPC binding is configured at all", async () => {
    const res = await resolveReportOutputTarget({
      reportKind: "batch",
      prefs: prefs({ autoExportDir: "C:/report" }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("批号");
    expect(readOpcString).not.toHaveBeenCalled();
  });

  it("fails when the export root directory is missing", async () => {
    const res = await resolveReportOutputTarget({
      reportKind: "batch",
      prefs: prefs({
        autoExportDir: "",
        autoFileNameOpcServerId: "srv1",
        autoFileNameOpcNodeId: "ns=2;s=batch",
      }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("保存文件夹");
  });
});

describe("normalizeBatchDirSegment", () => {
  it.each(["", "SCP/17", "SCP\\17", "..", "CON", "bad:name", "trail."])(
    "rejects invalid segment: %s",
    (v) => {
      expect(normalizeBatchDirSegment(v)).toBe("");
    },
  );

  it("keeps a valid segment", () => {
    expect(normalizeBatchDirSegment("SCP17")).toBe("SCP17");
  });
});
