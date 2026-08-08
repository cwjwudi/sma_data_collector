import { describe, expect, it } from "vitest";
import { formatPdfExportParallelProgressDetail } from "@/lib/pdf-export-parallel-progress";

describe("formatPdfExportParallelProgressDetail", () => {
  it("并行≤1 返回 null（走单路文案）", () => {
    expect(
      formatPdfExportParallelProgressDetail({
        totalReports: 80,
        partIndex: 3,
        workers: [{ busy: true, partIndex: 3 }],
      }),
    ).toBeNull();
    expect(
      formatPdfExportParallelProgressDetail({
        totalReports: 80,
        partIndex: 3,
      }),
    ).toBeNull();
  });

  it("任一档位并行≥2：分路显示且不依赖单个 partIndex", () => {
    const text = formatPdfExportParallelProgressDetail({
      phase: "render",
      partIndex: 99,
      totalReports: 80,
      completedParts: 12,
      workers: [
        { busy: true, partIndex: 12, stageLabel: "渲染 PDF" },
        { busy: true, partIndex: 15, stageLabel: "取数中（OPC / SQL）" },
        { busy: false, partIndex: 10 },
      ],
    });
    expect(text).toContain("已完成 12/80");
    expect(text).toContain("并行1第13份·渲染 PDF");
    expect(text).toContain("并行2第16份·取数中（OPC / SQL）");
    expect(text).toContain("并行3空闲");
    expect(text).not.toContain("第100");
  });
});
