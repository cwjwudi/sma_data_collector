/**
 * 限制并发 OPC HTTP 请求数，避免占满 Chromium 对 127.0.0.1:8000 的连接槽
 *（默认约 6 路），导致模版/版式等其它 API 被饿死、预览一直加载失败。
 *
 * 注意：Promise resolve 是微任务，pump 不能一次唤醒多个 waiter，
 * 否则会在 active 递增前超限并发。
 */
const MAX_CONCURRENT_OPC_HTTP = 2;

let active = 0;
const waiters: Array<() => void> = [];

export async function withOpcHttpSlot<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    if (active < MAX_CONCURRENT_OPC_HTTP) {
      active += 1;
      break;
    }
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  try {
    return await fn();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}
