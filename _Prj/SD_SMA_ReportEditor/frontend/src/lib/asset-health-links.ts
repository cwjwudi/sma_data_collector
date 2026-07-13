/** 仪表盘健康问题 → 编辑器路由链接（纯函数，供单测与 DashboardAssetHealth） */

import type { AssetHealthIssue } from "@/api/assets";

/** 连接级汇总：无单个控件可 focus */
export const CONNECTION_LEVEL_HEALTH_KINDS = new Set([
  "missing_db",
  "missing_default_database",
  "missing_password",
  "opc_server_missing",
]);

export function healthIssueFocusId(it: Pick<AssetHealthIssue, "meta">): string {
  const raw = it.meta?.elementId;
  return typeof raw === "string" ? raw.trim() : "";
}

export function isConnectionLevelHealthIssue(it: Pick<AssetHealthIssue, "kind" | "meta">): boolean {
  if (CONNECTION_LEVEL_HEALTH_KINDS.has(String(it.kind || ""))) return true;
  // 无 elementId 且带 connection_id 的也视为连接级（兼容扩展 kind）
  if (!healthIssueFocusId(it) && typeof it.meta?.connection_id === "string" && it.meta.connection_id) {
    return true;
  }
  return false;
}

export function connectionLevelHealthHint(it: Pick<AssetHealthIssue, "kind" | "meta" | "message">): string {
  const cid =
    typeof it.meta?.connection_id === "string" && it.meta.connection_id.trim()
      ? it.meta.connection_id.trim()
      : "";
  const name =
    typeof it.meta?.name === "string" && it.meta.name.trim() ? `「${it.meta.name.trim()}」` : "";
  const target = name || (cid ? `（ID ${cid.slice(0, 8)}…）` : "");
  if (it.kind === "missing_default_database") {
    return `此为连接级问题，不会选中单个控件。请到「数据源」为连接${target}填写默认数据库并保存。`;
  }
  if (it.kind === "missing_db") {
    return `此为连接级问题，不会选中单个控件。请到「数据源」核对连接${target}是否存在，或清理模版中指向旧 ID 的绑定。`;
  }
  if (it.kind === "missing_password") {
    return `此为连接级问题，不会选中单个控件。请到「数据源」为连接${target}配置密码。`;
  }
  return `此为连接级 / 无法定位到单个控件的问题${cid ? `（connection_id=${cid}）` : ""}。请到「数据源」检查，或打开模版后在绑定面板排查。`;
}

export function canFocusHealthIssue(it: Pick<AssetHealthIssue, "meta">): boolean {
  return healthIssueFocusId(it).length > 0;
}

export function templateEditorLink(it: Pick<AssetHealthIssue, "assetId" | "kind" | "meta">) {
  const focus = healthIssueFocusId(it);
  const query: Record<string, string> = {};
  if (focus) {
    query.focus = focus;
  } else if (isConnectionLevelHealthIssue(it)) {
    query.healthKind = String(it.kind || "");
    const cid = typeof it.meta?.connection_id === "string" ? it.meta.connection_id.trim() : "";
    if (cid) query.connectionId = cid;
    const name = typeof it.meta?.name === "string" ? it.meta.name.trim() : "";
    if (name) query.connectionName = name;
  }
  return {
    name: "TemplateEditor" as const,
    params: { id: it.assetId },
    query,
  };
}

export function layoutEditorLink(it: Pick<AssetHealthIssue, "assetId" | "meta">) {
  const focus = healthIssueFocusId(it);
  return {
    name: "LayoutPresetEditor" as const,
    params: { id: it.assetId },
    query: focus ? { focus } : {},
  };
}

/** 列表旁短提示（无 focus 时） */
export function healthIssueFocusabilityNote(it: Pick<AssetHealthIssue, "kind" | "meta">): string {
  if (canFocusHealthIssue(it)) return "";
  if (isConnectionLevelHealthIssue(it)) return "连接级问题，跳转后不会选中单个控件";
  return "无法定位到单个控件";
}
