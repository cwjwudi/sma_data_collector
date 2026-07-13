/** 串行落库：连点时只保留最新目标，避免并发 PATCH 互相覆盖。 */

export type SerialPersistHandlers<T> = {
  save: (value: T) => Promise<void>;
  /** 某次 save 成功且其后没有更新目标时回调 */
  onSettled: (value: T) => void;
  onError: (error: unknown, value: T) => void;
};

export type SerialPersister<T> = {
  /** 是否仍有未完成的 save / 排队目标 */
  isBusy: () => boolean;
  enqueue: (value: T) => void;
};

export function createSerialPersister<T>(handlers: SerialPersistHandlers<T>): SerialPersister<T> {
  let queued: T | null = null;
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      while (queued !== null) {
        const next = queued;
        queued = null;
        try {
          await handlers.save(next);
          // 保存期间若又入队了更新目标，继续循环；仅最终态触发 settled
          if (queued === null) {
            handlers.onSettled(next);
          }
        } catch (error) {
          if (queued === null) {
            handlers.onError(error, next);
          }
        }
      }
    } finally {
      running = false;
      // run 收尾瞬间又有入队时补跑
      if (queued !== null) {
        void run();
      }
    }
  }

  return {
    isBusy: () => running || queued !== null,
    enqueue(value: T) {
      queued = value;
      void run();
    },
  };
}
