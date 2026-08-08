import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditResultLabel,
  formatAuditDetailReadable,
  formatAuditNameList,
  summarizeDeleteLayouts,
  summarizeDeleteTemplates,
} from "./auditLabels";

describe("auditLabels", () => {
  it("maps known actions to Chinese", () => {
    expect(auditActionLabel("template.save")).toBe("保存报表模版");
    expect(auditActionLabel("db.connection_save")).toBe("保存数据库连接");
    expect(auditActionLabel("layout.delete")).toBe("删除版式");
  });

  it("maps results", () => {
    expect(auditResultLabel("ok")).toBe("成功");
    expect(auditResultLabel("fail")).toBe("失败");
  });

  it("covers documented action keys", () => {
    const required = [
      "template.save",
      "template.delete",
      "template.duplicate",
      "layout.save",
      "layout.delete",
      "layout.duplicate",
      "config.export",
      "support.pack_export",
      "db.connection_save",
      "export.manual_pdf",
      "audit.export",
      "history.removable_open",
      "history.removable_dismiss",
      "history.select_right_root",
      "history.copy",
      "history.move",
    ];
    for (const k of required) {
      expect(AUDIT_ACTION_LABELS[k]).toBeTruthy();
      expect(AUDIT_ACTION_LABELS[k]).not.toMatch(/^[a-z]+\./);
    }
  });

  it("truncates long name lists", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    expect(formatAuditNameList(names)).toContain("等共 7 个");
    expect(summarizeDeleteTemplates(["日报表"])).toBe('删除报表模版「日报表」');
    expect(summarizeDeleteTemplates(["A", "B", "C"])).toContain("3 个");
    expect(summarizeDeleteLayouts(["页眉1"])).toContain("版式");
  });

  it("formats change lines for expand panel", () => {
    const text = formatAuditDetailReadable(
      {
        save_count: 2,
        change_count: 1,
        change_lines: ["第 1 页 · 文本「标题」", "  · 文字内容：月报 → 日报"],
      },
      { objectType: "template", objectId: "abc", actor: { os_user: "dp", hostname: "mac" } },
    );
    expect(text).toContain("报表模版");
    expect(text).toContain("本机用户");
    expect(text).toContain("变更明细");
    expect(text).toContain("月报 → 日报");
    expect(text).not.toContain("PUT");
  });
});
