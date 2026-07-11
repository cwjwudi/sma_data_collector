import { onBeforeUnmount, ref } from "vue";

/**
 * 组件卸载或开启新一轮异步任务后，进行中的旧任务应放弃写回状态。
 * begin() 会递增 generation，使并发的旧请求在完成时被 isStale 丢弃，
 * 避免「先发出的失败请求」覆盖「后发出的成功结果」（模版列表曾因此被清空成 0/0）。
 */
export function useStaleGuard() {
  const generation = ref(0);

  onBeforeUnmount(() => {
    generation.value += 1;
  });

  function begin(): number {
    generation.value += 1;
    return generation.value;
  }

  function isStale(token: number): boolean {
    return token !== generation.value;
  }

  function invalidate(): void {
    generation.value += 1;
  }

  return { begin, isStale, invalidate };
}

/** 限制并发数的 map */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Math.min(Math.max(1, limit), items.length);

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
