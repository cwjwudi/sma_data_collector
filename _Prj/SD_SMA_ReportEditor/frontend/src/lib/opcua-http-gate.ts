/**
 * 限制并发 OPC HTTP 请求数，避免占满 Chromium 对 127.0.0.1:8000 的连接槽
 *（默认约 6 路），导致模版/版式等其它 API 被饿死、预览一直加载失败。
 */
const MAX_CONCURRENT_OPC_HTTP = 2;

let active = 0;
const waiters: Array<() => void> = [];

function pump(): void {
  while (active < MAX_CONCURRENT_OPC_HTTP && waiters.length) {
    const next = waiters.shift();
    if (next) next();
  }
}

export async function withOpcHttpSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_OPC_HTTP) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    pump();
  }
}
