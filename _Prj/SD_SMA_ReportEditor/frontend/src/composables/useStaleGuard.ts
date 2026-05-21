import { onBeforeUnmount, ref } from "vue";

/** 组件卸载或手动 invalidate 后，进行中的异步任务应放弃写回状态 */
export function useStaleGuard() {
  const generation = ref(0);

  onBeforeUnmount(() => {
    generation.value += 1;
  });

  function begin(): number {
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
