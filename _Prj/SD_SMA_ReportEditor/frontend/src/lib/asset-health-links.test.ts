import { describe, expect, it } from "vitest";
import type { AssetHealthIssue } from "@/api/assets";
import {
  canFocusHealthIssue,
  connectionLevelHealthHint,
  healthIssueFocusabilityNote,
  layoutEditorLink,
  templateEditorLink,
} from "@/lib/asset-health-links";

function issue(partial: Partial<AssetHealthIssue> & Pick<AssetHealthIssue, "kind">): AssetHealthIssue {
  return {
    severity: "warn",
    message: "m",
    assetKind: "template",
    assetId: "t1",
    assetName: "T",
    meta: {},
    ...partial,
  };
}

describe("asset-health-links (007 A/E)", () => {
  it("A1 missing_db 无 focus，带 healthKind", () => {
    const it = issue({ kind: "missing_db", meta: { connection_id: "c-old" } });
    const link = templateEditorLink(it);
    expect(link.name).toBe("TemplateEditor");
    expect(link.params.id).toBe("t1");
    expect(link.query.focus).toBeUndefined();
    expect(link.query.healthKind).toBe("missing_db");
    expect(link.query.connectionId).toBe("c-old");
    expect(canFocusHealthIssue(it)).toBe(false);
  });

  it("A2 missing_default_database 无 focus", () => {
    const it = issue({
      kind: "missing_default_database",
      meta: { connection_id: "c1", name: "SMA" },
    });
    const link = templateEditorLink(it);
    expect(link.query.focus).toBeUndefined();
    expect(link.query.healthKind).toBe("missing_default_database");
    expect(link.query.connectionName).toBe("SMA");
  });

  it("A3 OPC 空节点有 focus，不带 healthKind", () => {
    const it = issue({
      kind: "opc_binding_empty_node",
      meta: { elementId: "e1" },
    });
    const link = templateEditorLink(it);
    expect(link.query).toEqual({ focus: "e1" });
  });

  it("A4 elementId 仅空白 → 无 focus", () => {
    const it = issue({ kind: "opc_binding_empty_node", meta: { elementId: "  " } });
    expect(templateEditorLink(it).query.focus).toBeUndefined();
    expect(canFocusHealthIssue(it)).toBe(false);
  });

  it("A5 非字符串 elementId → 无 focus", () => {
    const it = issue({ kind: "opc_binding_empty_node", meta: { elementId: 123 as unknown as string } });
    // meta typed loosely at runtime
    const raw = { ...it, meta: { elementId: 123 } };
    expect(templateEditorLink(raw).query.focus).toBeUndefined();
  });

  it("A6 模版链接目标", () => {
    const link = templateEditorLink(issue({ kind: "x", assetId: "abc" }));
    expect(link.name).toBe("TemplateEditor");
    expect(link.params.id).toBe("abc");
  });

  it("A7 无 focus 项明示连接级", () => {
    const it = issue({ kind: "missing_db", meta: { connection_id: "c1" } });
    expect(healthIssueFocusabilityNote(it)).toMatch(/连接级/);
    expect(connectionLevelHealthHint(it)).toMatch(/不会选中单个控件/);
  });

  it("E1 版式链接进 LayoutPresetEditor", () => {
    const it = issue({
      kind: "orphan_layout_preset",
      assetKind: "layout",
      assetId: "lp1",
    });
    const link = layoutEditorLink(it);
    expect(link.name).toBe("LayoutPresetEditor");
    expect(link.params.id).toBe("lp1");
    expect(link.query).toEqual({});
  });

  it("E2 版式带 elementId 时带 focus", () => {
    const link = layoutEditorLink(
      issue({ kind: "x", assetKind: "layout", assetId: "lp1", meta: { elementId: "z9" } }),
    );
    expect(link.query).toEqual({ focus: "z9" });
  });
});
