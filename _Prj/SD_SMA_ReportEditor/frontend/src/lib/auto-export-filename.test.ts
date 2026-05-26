import { describe, expect, it } from "vitest";
import { appendOpcExportSuffix } from "@/lib/auto-export-filename";

describe("appendOpcExportSuffix", () => {
  it("returns stem unchanged when hash suffix disabled", () => {
    expect(appendOpcExportSuffix("Lot-001", "_", false)).toBe("Lot-001");
  });

  it("appends timestamp and 8-char hash when enabled", () => {
    const out = appendOpcExportSuffix("Lot-001", "_", true);
    expect(out).toMatch(/^Lot-001_\d{8}_\d{6}_[a-f0-9]{8}$/i);
  });
});
