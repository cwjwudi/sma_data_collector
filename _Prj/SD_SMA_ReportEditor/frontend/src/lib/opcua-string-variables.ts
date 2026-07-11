/** 已保存 OPC UA 连接下的 String 变量列表（生成报表导出路径等） */

import { apiFetch } from "@/api/client.js";
import { opcDataTypeLabelFromRead } from "@/features/datasource/opcua/opcua-value-meta.js";
import { opcDataTypeLabelMatchesFilter } from "@/features/datasource/opcua/opcua-tree-utils.js";

export type OpcStringVariableHit = {
  node_id: string;
  label: string;
  path_str?: string;
  data_type?: string;
};

function hitLabel(h: {
  display_name?: string;
  browse_name?: string;
  node_id?: string;
  path_str?: string;
}): string {
  const path = (h.path_str || "").trim();
  const disp = (h.display_name || h.browse_name || h.node_id || "").trim();
  if (path && disp) return `${path} · ${disp}`;
  return path || disp || String(h.node_id || "");
}

/** 列出已保存服务器下全部 String 类型变量（有扫描上限，可能截断）。 */
export async function listSavedOpcStringVariables(serverId: string): Promise<{
  ok: boolean;
  hits: OpcStringVariableHit[];
  truncated?: boolean;
  message?: string;
}> {
  const sid = serverId.trim();
  if (!sid) return { ok: false, hits: [], message: "未选择 OPC UA 连接" };
  try {
    const res = (await apiFetch(`/opcua/search_saved/${encodeURIComponent(sid)}`, {
      method: "POST",
      body: { query: "", data_type: "String", max_results: 200, max_scan: 12000 },
    })) as {
      ok?: boolean;
      hits?: Array<Record<string, unknown>>;
      truncated?: boolean;
      message?: string;
    };
    if (res.ok === false) {
      return { ok: false, hits: [], message: String(res.message || "扫描失败") };
    }
    const hits = (res.hits || []).map((h) => ({
      node_id: String(h.node_id || ""),
      label: hitLabel(h as OpcStringVariableHit),
      path_str: typeof h.path_str === "string" ? h.path_str : undefined,
      data_type: typeof h.data_type === "string" ? h.data_type : undefined,
    }));
    return { ok: true, hits, truncated: Boolean(res.truncated) };
  } catch (e) {
    return { ok: false, hits: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export type SavedOpcReadResult = {
  ok: boolean;
  value?: unknown;
  message?: string;
  dataType?: string;
};

import { apiFetch } from "@/api/client.js";

export async function readSavedOpcNodeValue(
  serverId: string,
  nodeId: string,
): Promise<SavedOpcReadResult> {
  const sid = serverId.trim();
  const nid = nodeId.trim();
  if (!sid || !nid) return { ok: false, message: "缺少连接或节点" };
  try {
    const res = (await apiFetch(`/opcua/read_saved/${encodeURIComponent(sid)}`, {
      method: "POST",
      body: { node_id: nid },
    })) as { ok?: boolean; value?: unknown; message?: string; attributes?: unknown };
    if (res.ok === false) return { ok: false, message: String(res.message || "读取失败") };
    const dataType = opcDataTypeLabelFromRead(res) || undefined;
    return { ok: true, value: res.value, dataType };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 读取并校验必须为 String 类型（自动导出文件名等） */
export async function readSavedOpcStringValue(
  serverId: string,
  nodeId: string,
): Promise<SavedOpcReadResult> {
  const read = await readSavedOpcNodeValue(serverId, nodeId);
  if (!read.ok) return read;
  const dt = read.dataType || "";
  if (dt && !opcDataTypeLabelMatchesFilter(dt, "String")) {
    return { ok: false, message: `需要 String 类型变量，当前为 ${dt}` };
  }
  if (!dt && typeof read.value !== "string") {
    return { ok: false, message: "需要 String 类型变量" };
  }
  return read;
}

/** 将 OPC 读值规范为文件名字符串（仅接受 string 值） */
export function coerceOpcFileNameString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** 将 OPC 读值规范为导出目录路径字符串 */
export function coerceOpcPathString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return String(value).trim();
}
