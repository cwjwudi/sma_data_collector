import { beforeEach, describe, expect, it, vi } from "vitest";

const opcMocks = vi.hoisted(() => ({
  readSavedOpcStringValue: vi.fn(),
}));

vi.mock("@/lib/opcua-string-variables", () => ({
  coerceOpcFileNameString: (value: unknown) => (typeof value === "string" ? value.trim() : ""),
  readSavedOpcStringValue: opcMocks.readSavedOpcStringValue,
}));

import {
  appendOpcExportSuffix,
  buildAutoExportFileName,
  previewAutoExportFileName,
} from "@/lib/auto-export-filename";
import { defaultReportGeneratorPrefs } from "@/lib/report-generator-prefs";

beforeEach(() => {
  opcMocks.readSavedOpcStringValue.mockReset();
});

describe("appendOpcExportSuffix", () => {
  it("returns stem unchanged when hash suffix disabled", () => {
    expect(appendOpcExportSuffix("Lot-001", "_", false)).toBe("Lot-001");
  });

  it("appends timestamp and 8-char hash when enabled", () => {
    const out = appendOpcExportSuffix("Lot-001", "_", true);
    expect(out).toMatch(/^Lot-001_\d{8}_\d{6}_[a-f0-9]{8}$/i);
  });
});

describe("merged OPC UA file name segment", () => {
  it("shows OPC variable placeholder after template name in preview", () => {
    const prefs = defaultReportGeneratorPrefs();
    prefs.autoFileNameSegments = ["name", "opcua", "ts", "hash"];

    expect(previewAutoExportFileName(prefs, "测试模板")).toMatch(
      /^测试模板_OPC变量_\d{8}_\d{6}_a1b2c3d4\.pdf$/,
    );
  });

  it("reads OPC String value and joins it with selected file name segments", async () => {
    opcMocks.readSavedOpcStringValue.mockResolvedValue({
      ok: true,
      value: "Lot:001.pdf",
      dataType: "String",
    });
    const prefs = defaultReportGeneratorPrefs();
    prefs.autoFileNameSegments = ["name", "opcua", "hash"];
    prefs.autoFileNameOpcServerId = "srv-a";
    prefs.autoFileNameOpcNodeId = "ns=1;s=LotName";

    const out = await buildAutoExportFileName(prefs, "测试模板");

    expect(opcMocks.readSavedOpcStringValue).toHaveBeenCalledWith("srv-a", "ns=1;s=LotName");
    expect(out.note).toBeUndefined();
    expect(out.base).toMatch(/^测试模板_Lot_001_[a-f0-9]{8}\.pdf$/i);
  });

  it("skips OPC segment and keeps other segments when OPC binding is missing", async () => {
    const prefs = defaultReportGeneratorPrefs();
    prefs.autoFileNameSegments = ["name", "opcua", "hash"];

    const out = await buildAutoExportFileName(prefs, "测试模板");

    expect(opcMocks.readSavedOpcStringValue).not.toHaveBeenCalled();
    expect(out.note).toContain("未绑定 OPC 文件名变量");
    expect(out.base).toMatch(/^测试模板_[a-f0-9]{8}\.pdf$/i);
  });
});
