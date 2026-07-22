import { describe, expect, it, vi } from "vitest";
import {
  buildExportCancelToastAction,
  requestCancelPdfExport,
  shouldShowExportCancelControl,
} from "@/lib/pdf-export-cancel-ui";

describe("pdf-export-cancel-ui (034 M7)", () => {
  it("shows control only when busy and jobId present", () => {
    expect(shouldShowExportCancelControl(true, "j1")).toBe(true);
    expect(shouldShowExportCancelControl(true, "  ")).toBe(false);
    expect(shouldShowExportCancelControl(false, "j1")).toBe(false);
  });

  it("requestCancelPdfExport no-ops on empty jobId", () => {
    const cancelPdfExport = vi.fn();
    expect(requestCancelPdfExport("", { cancelPdfExport })).toBe(false);
    expect(requestCancelPdfExport("  ", { cancelPdfExport })).toBe(false);
    expect(cancelPdfExport).not.toHaveBeenCalled();
  });

  it("requestCancelPdfExport calls API with trimmed jobId", () => {
    const cancelPdfExport = vi.fn(async () => ({ ok: true }));
    expect(requestCancelPdfExport("  job-9  ", { cancelPdfExport })).toBe(true);
    expect(cancelPdfExport).toHaveBeenCalledWith({ jobId: "job-9" });
  });

  it("toast action omitted without jobId", () => {
    expect(buildExportCancelToastAction("", () => {})).toBeUndefined();
    const onCancel = vi.fn();
    const action = buildExportCancelToastAction("j2", onCancel);
    expect(action?.label).toBe("取消");
    action?.onClick();
    expect(onCancel).toHaveBeenCalled();
  });
});
