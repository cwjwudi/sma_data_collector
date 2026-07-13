import { describe, expect, it, vi } from "vitest";
import { createSerialPersister } from "./connection-probe-serial-persist";

describe("createSerialPersister", () => {
  it("连点只落最后一次目标，且中间态不触发 onSettled", async () => {
    const saved: boolean[] = [];
    const settled: boolean[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const persister = createSerialPersister<boolean>({
      save: async (v) => {
        saved.push(v);
        if (saved.length === 1) await gate;
      },
      onSettled: (v) => settled.push(v),
      onError: () => {
        throw new Error("should not error");
      },
    });

    persister.enqueue(true);
    persister.enqueue(false);
    persister.enqueue(true);

    release();
    await vi.waitFor(() => {
      expect(persister.isBusy()).toBe(false);
    });

    // 第一次 true 写入中被连点覆盖；最终只保证落盘终点为 true，且 settled 一次
    expect(saved[0]).toBe(true);
    expect(saved.at(-1)).toBe(true);
    expect(settled).toEqual([true]);
  });

  it("保存失败且无更新队列时走 onError", async () => {
    const errors: unknown[] = [];
    const persister = createSerialPersister<string>({
      save: async () => {
        throw new Error("boom");
      },
      onSettled: () => {
        throw new Error("should not settle");
      },
      onError: (e) => errors.push(e),
    });
    persister.enqueue("x");
    await vi.waitFor(() => expect(persister.isBusy()).toBe(false));
    expect(String(errors[0])).toContain("boom");
  });
});
