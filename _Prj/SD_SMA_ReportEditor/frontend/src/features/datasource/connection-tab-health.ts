import { apiFetch } from "@/api/client.js";

/** 连接标签指示灯：绿=健康，红=失败，灰=未检测，黄=检测中 */
export type ConnectionHealthState = "unknown" | "checking" | "ok" | "fail";

export type ConnectionHealthSummary = { ok: number; fail: number; total: number };

export type ConnectionProbeResult = { ok: boolean; message: string };

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

function probeMessageFromResponse(res: { ok?: boolean; message?: unknown } | null | undefined): string {
  if (res?.ok === true) return "";
  const raw = res?.message;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "连接失败";
}

export async function probeDatabaseConnection(connectionId: string): Promise<ConnectionProbeResult> {
  if (!connectionId?.trim()) return { ok: false, message: "缺少连接 ID" };
  try {
    const res = (await apiFetch(
      `/database/test_saved/${encodeURIComponent(connectionId.trim())}`,
      { method: "POST", body: {} },
    )) as { ok?: boolean; message?: string };
    return { ok: res?.ok === true, message: probeMessageFromResponse(res) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function probeOpcSavedConnection(serverId: string): Promise<ConnectionProbeResult> {
  if (!serverId?.trim()) return { ok: false, message: "缺少连接 ID" };
  try {
    const res = (await apiFetch(`/opcua/test_saved/${encodeURIComponent(serverId.trim())}`, {
      method: "POST",
      body: {},
    })) as { ok?: boolean; message?: string };
    return { ok: res?.ok === true, message: probeMessageFromResponse(res) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

const probeBatchGenerationByScope = new Map<string, number>();

export type ProbeConnectionOptions = {
  /**
   * 静默探测：不先把指示灯设为黄色，保留当前红/绿/灰，待本轮结果返回后再更新。
   * 用于定时轮询，避免每 5 秒闪黄造成不安。
   */
  silent?: boolean;
  /**
   * 最大并行探测数。默认 2，避免多条不可达 OPC/DB 同时占满后端超时窗口，拖垮保存/删除。
   * 设为 0 或负数表示不限制（旧行为：全并行）。
   */
  concurrency?: number;
};

/** 后台批量探测（限流并行），逐条回调状态；同 scope 内新一批开始后忽略上一批未完成的结果 */
export async function probeConnectionIds(
  ids: string[],
  probe: (id: string) => Promise<ConnectionProbeResult>,
  onState: (id: string, state: ConnectionHealthState, message?: string) => void,
  scope = "default",
  options: ProbeConnectionOptions = { silent: true },
): Promise<void> {
  const list = ids.filter((id) => id?.trim());
  if (!list.length) return;
  const silent = options.silent !== false;
  const concurrencyRaw = options.concurrency;
  const concurrency =
    concurrencyRaw === undefined
      ? 2
      : concurrencyRaw <= 0
        ? list.length
        : Math.max(1, Math.floor(concurrencyRaw));
  const batchId = (probeBatchGenerationByScope.get(scope) ?? 0) + 1;
  probeBatchGenerationByScope.set(scope, batchId);
  const emit = (id: string, state: ConnectionHealthState, message = "") => {
    if (batchId !== probeBatchGenerationByScope.get(scope)) return;
    onState(id, state, message);
  };
  if (!silent) {
    for (const id of list) {
      emit(id, "checking");
    }
  }
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= list.length) return;
      if (batchId !== probeBatchGenerationByScope.get(scope)) return;
      const id = list[i];
      const res = await probe(id);
      emit(id, res.ok ? "ok" : "fail", res.message);
    }
  });
  await Promise.all(workers);
}
