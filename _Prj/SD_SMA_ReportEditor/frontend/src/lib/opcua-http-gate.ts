/**
 * 限制并发 OPC HTTP 请求，避免占满 Chromium 对 127.0.0.1:8000 的连接槽
 *（默认约 6 路），导致模版/版式等其它 API 被饿死。
 *
 * 槽位分层：
 * - 配置 CRUD（/opcua/servers*）**不占槽**——删除/保存不可被坏链 browse/探活堵死
 * - 探活（test / test_saved / ping）独立 1 槽——坏链超时最多占 1 路
 * - browse/read/search/write 等业务最多 2 槽
 *
 * 注意：Promise resolve 是微任务，pump 不能一次唤醒多个 waiter，
 * 否则会在 active 递增前超限并发。
 */

type GateKind = "browse" | "probe";

const MAX_BROWSE = 2;
const MAX_PROBE = 1;

const state: Record<GateKind, { active: number; max: number; waiters: Array<() => void> }> = {
  browse: { active: 0, max: MAX_BROWSE, waiters: [] },
  probe: { active: 0, max: MAX_PROBE, waiters: [] },
};

export function classifyOpcHttpPath(path: string): GateKind | "ungated" {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!p.startsWith("/opcua/")) return "ungated";
  // 配置读写：绝不排队
  if (p === "/opcua/servers" || p.startsWith("/opcua/servers/")) return "ungated";
  // 连通探测：独立小槽，避免与地址空间浏览互卡
  if (
    p === "/opcua/test" ||
    p.startsWith("/opcua/test_saved/") ||
    p.startsWith("/opcua/ping_saved/")
  ) {
    return "probe";
  }
  return "browse";
}

async function withGate<T>(kind: GateKind, fn: () => Promise<T>): Promise<T> {
  const g = state[kind];
  for (;;) {
    if (g.active < g.max) {
      g.active += 1;
      break;
    }
    await new Promise<void>((resolve) => {
      g.waiters.push(resolve);
    });
  }
  try {
    return await fn();
  } finally {
    g.active -= 1;
    const next = g.waiters.shift();
    if (next) next();
  }
}

/** @deprecated 保留给旧调用；新代码请用 withOpcHttpSlotForPath */
export async function withOpcHttpSlot<T>(fn: () => Promise<T>): Promise<T> {
  return withGate("browse", fn);
}

export async function withOpcHttpSlotForPath<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const kind = classifyOpcHttpPath(path);
  if (kind === "ungated") return fn();
  return withGate(kind, fn);
}
