import { beforeEach, describe, expect, it, vi } from "vitest";
import { appToasts, dismissAppToast } from "@/composables/useAppToast";
import {
  endBatchExportProgress,
  hasActiveReportExport,
  openGenerateReportPage,
  primaryReportExportSession,
  publishBatchExportProgress,
  registerOpenGenerateReportPage,
  reportExportProgressSessions,
  restoreBatchExportProgress,
  tryMinimizeBatchExportProgress,
} from "@/lib/report-export-progress-state";

describe("report-export-progress-state", () => {
  beforeEach(() => {
    reportExportProgressSessions.value = [];
    appToasts.value = [];
    registerOpenGenerateReportPage(null);
  });

  it("publish shows toast with open-page action while busy", () => {
    const onCancel = vi.fn();
    publishBatchExportProgress({
      id: "batch-progress-manual",
      title: "模拟结批",
      detail: "已保存第 14/80 份 PDF…",
      jobId: "job-1",
      onCancel,
    });
    expect(hasActiveReportExport.value).toBe(true);
    const toast = appToasts.value.find((t) => t.id === "batch-progress-manual");
    expect(toast?.spinner).toBe(true);
    expect(toast?.secondaryAction?.label).toBe("打开页面");
    expect(toast?.action?.label).toBe("取消");
    toast?.action?.onClick();
    expect(onCancel).toHaveBeenCalled();
  });

  it("dismiss while busy minimizes to sidebar session instead of dropping progress", () => {
    publishBatchExportProgress({
      id: "batch-progress-manual",
      title: "模拟结批",
      detail: "正在取数…",
      jobId: "job-1",
    });
    expect(tryMinimizeBatchExportProgress("batch-progress-manual")).toBe(true);
    expect(appToasts.value.find((t) => t.id === "batch-progress-manual")).toBeUndefined();
    expect(primaryReportExportSession.value?.minimized).toBe(true);
    expect(hasActiveReportExport.value).toBe(true);

    // 收起后进度文案仍更新（侧栏可读）
    publishBatchExportProgress({
      id: "batch-progress-manual",
      title: "模拟结批",
      detail: "已保存第 14/80 份 PDF…",
      jobId: "job-1",
    });
    expect(primaryReportExportSession.value?.detail).toContain("14/80");
    expect(appToasts.value.find((t) => t.id === "batch-progress-manual")).toBeUndefined();
  });

  it("restore reopens toast and navigates to generate page", () => {
    const open = vi.fn();
    registerOpenGenerateReportPage(open);
    publishBatchExportProgress({
      id: "batch-progress-manual",
      title: "模拟结批",
      detail: "已保存第 2/80 份 PDF…",
      jobId: "job-9",
    });
    tryMinimizeBatchExportProgress("batch-progress-manual");
    restoreBatchExportProgress("batch-progress-manual");
    expect(primaryReportExportSession.value?.minimized).toBe(false);
    expect(appToasts.value.some((t) => t.id === "batch-progress-manual")).toBe(true);
    expect(open).toHaveBeenCalled();
  });

  it("end clears session; openGenerateReportPage uses registered handler", () => {
    const open = vi.fn();
    registerOpenGenerateReportPage(open);
    publishBatchExportProgress({
      id: "batch-progress-x",
      title: "OPC",
      detail: "…",
      jobId: "j",
    });
    endBatchExportProgress("batch-progress-x");
    expect(hasActiveReportExport.value).toBe(false);
    dismissAppToast("batch-progress-x");
    openGenerateReportPage();
    expect(open).toHaveBeenCalled();
  });
});
