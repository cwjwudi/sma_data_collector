import { describe, expect, it } from "vitest";
import {
  buildHistoryTransferAudit,
  buildRemovableDismissAudit,
  buildRemovableOpenAudit,
  buildSelectRightRootAudit,
  directionLabelZh,
  historyTransferDirection,
} from "./history-audit";

describe("history-audit", () => {
  it("direction helpers", () => {
    expect(historyTransferDirection("left")).toBe("left_to_right");
    expect(historyTransferDirection("right")).toBe("right_to_left");
    expect(directionLabelZh("left_to_right")).toBe("左→右");
  });

  it("removable open / dismiss summaries", () => {
    const open = buildRemovableOpenAudit({ path: "E:\\", label: "USB", platform: "win32" });
    expect(open.action).toBe("history.removable_open");
    expect(open.summary).toContain("打开可移动存储");
    expect(open.summary).toContain("USB");
    expect(open.detail?.path).toBe("E:\\");

    const dismiss = buildRemovableDismissAudit({ path: "E:\\", label: "USB" });
    expect(dismiss.action).toBe("history.removable_dismiss");
    expect(dismiss.summary).toContain("忽略");
  });

  it("select right root", () => {
    const a = buildSelectRightRootAudit("/tmp/out");
    expect(a.action).toBe("history.select_right_root");
    expect(a.summary).toContain("/tmp/out");
  });

  it("transfer batch summary with fail samples", () => {
    const a = buildHistoryTransferAudit({
      mode: "copy",
      from: "left",
      sourceRoot: "/L",
      destRoot: "/R",
      destDir: "/R/cwd",
      conflict: "rename",
      sourceCount: 3,
      res: {
        ok: false,
        copied: 1,
        moved: 0,
        skipped: 1,
        failed: 1,
        results: [
          { status: "copied", source: "/L/a.pdf" },
          { status: "failed", source: "/L/b.pdf", error: "EACCES" },
        ],
      },
    });
    expect(a.action).toBe("history.copy");
    expect(a.result).toBe("fail");
    expect(a.summary).toContain("左→右");
    expect(a.summary).toContain("改名");
    expect(a.detail?.failSamples).toEqual([{ source: "/L/b.pdf", error: "EACCES" }]);
  });

  it("move ok", () => {
    const a = buildHistoryTransferAudit({
      mode: "move",
      from: "right",
      sourceRoot: "/R",
      destRoot: "/L",
      destDir: "/L",
      sourceCount: 1,
      res: { ok: true, copied: 0, moved: 1, skipped: 0, failed: 0 },
    });
    expect(a.action).toBe("history.move");
    expect(a.result).toBe("ok");
    expect(a.summary).toContain("移动");
    expect(a.summary).toContain("右→左");
  });
});
