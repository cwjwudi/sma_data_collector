import { apiFetch } from "@/api/client.js";

export async function writeSavedOpcNodeValue(
  serverId: string,
  nodeId: string,
  value: unknown,
): Promise<{ ok: boolean; message?: string }> {
  const sid = serverId.trim();
  const nid = nodeId.trim();
  if (!sid || !nid) {
    return { ok: false, message: "未配置 OPC UA 连接或节点" };
  }
  try {
    const res = (await apiFetch(`/opcua/write_saved/${encodeURIComponent(sid)}`, {
      method: "POST",
      body: { node_id: nid, value },
    })) as { ok?: boolean; message?: string };
    if (res?.ok) return { ok: true };
    return { ok: false, message: res?.message || "写入 OPC UA 失败" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
