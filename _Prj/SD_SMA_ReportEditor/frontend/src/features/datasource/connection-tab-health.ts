import { apiFetch } from "@/api/client.js";

/** 连接标签指示灯：绿=健康，红=失败，灰=未检测，黄=检测中 */
export type ConnectionHealthState = "unknown" | "checking" | "ok" | "fail";

export type ConnectionHealthSummary = { ok: number; fail: number; total: number };

/** 统计已保存连接中健康（ok）、失败（fail）数量与总数 */
export function summarizeConnectionHealth(
  ids: string[],
  healthById: Record<string, ConnectionHealthState | undefined>,
): ConnectionHealthSummary {
  const list = ids.filter((id) => id?.trim());
  const total = list.length;
  const ok = list.filter((id) => healthById[id] === "ok").length;
  const fail = list.filter((id) => healthById[id] === "fail").length;
  return { ok, fail, total };
}

export async function probeDatabaseConnection(connectionId: string): Promise<boolean> {
  if (!connectionId?.trim()) return false;
  try {
    const res = (await apiFetch(
      `/database/test_saved/${encodeURIComponent(connectionId.trim())}`,
      { method: "POST", body: {} },
    )) as { ok?: boolean };
    return res?.ok === true;
  } catch {
    return false;
  }
}

export async function probeOpcSavedConnection(serverId: string): Promise<boolean> {
  if (!serverId?.trim()) return false;
  try {
    const res = (await apiFetch(`/opcua/test_saved/${encodeURIComponent(serverId.trim())}`, {
      method: "POST",
      body: {},
    })) as { ok?: boolean };
    return res?.ok === true;
  } catch {
    return false;
  }
}

const probeBatchGenerationByScope = new Map<string, number>();

export type ProbeConnectionOptions = {
  /**
   * 静默探测：不先把指示灯设为黄色，保留当前红/绿/灰，待本轮结果返回后再更新。
   * 用于定时轮询，避免每 5 秒闪黄造成不安。
   */
  silent?: boolean;
};

/** 后台批量探测（并行），逐条回调状态；同 scope 内新一批开始后忽略上一批未完成的结果 */
export async function probeConnectionIds(
  ids: string[],
  probe: (id: string) => Promise<boolean>,
  onState: (id: string, state: ConnectionHealthState) => void,
  scope = "default",
  options: ProbeConnectionOptions = { silent: true },
): Promise<void> {
  const list = ids.filter((id) => id?.trim());
  if (!list.length) return;
  const silent = options.silent !== false;
  const batchId = (probeBatchGenerationByScope.get(scope) ?? 0) + 1;
  probeBatchGenerationByScope.set(scope, batchId);
  const emit = (id: string, state: ConnectionHealthState) => {
    if (batchId !== probeBatchGenerationByScope.get(scope)) return;
    onState(id, state);
  };
  if (!silent) {
    for (const id of list) {
      emit(id, "checking");
    }
  }
  await Promise.all(
    list.map(async (id) => {
      const ok = await probe(id);
      emit(id, ok ? "ok" : "fail");
    }),
  );
}
