/**
 * 034 M1 / L13：TemplateManager 卡片 Observer 须 teardown + restart（KeepAlive 行为探针）
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { usePageLifecycle } from "@/composables/usePageLifecycle";
import { nextThumbObserverAction } from "@/lib/history-thumb-visibility";

describe("tm-card-observer lifecycle (034 M1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("KeepAlive leave tears down; return restarts observer (not ensure-only)", async () => {
    const disconnect = vi.fn();
    let hasObserver = false;
    const create = vi.fn(() => {
      hasObserver = true;
    });
    const teardown = vi.fn(() => {
      disconnect();
      hasObserver = false;
    });
    const resync = vi.fn(() => {
      const action = nextThumbObserverAction(hasObserver, "restart");
      if (action === "restart") teardown();
      create();
    });

    const show = ref(true);
    const Child = defineComponent({
      name: "TemplateManager",
      setup() {
        const { register } = usePageLifecycle("TemplateManager");
        register({
          id: "tm-card-observer",
          scope: "page",
          pause: teardown,
          resume: resync,
        });
        return () => h("div", "tm");
      },
    });
    const Host = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () => (show.value ? h(Child) : null),
          });
      },
    });

    mount(Host);
    await flushPromises();
    await nextTick();
    expect(resync.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(create).toHaveBeenCalled();

    const teardownBefore = teardown.mock.calls.length;
    show.value = false;
    await nextTick();
    await flushPromises();
    expect(teardown.mock.calls.length).toBeGreaterThan(teardownBefore);
    expect(hasObserver).toBe(false);

    create.mockClear();
    resync.mockClear();
    show.value = true;
    await nextTick();
    await flushPromises();
    expect(resync.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(create).toHaveBeenCalled();
    // resume 路径必须能在无 observer 时 create（restart 语义，非 ensure noop）
    expect(nextThumbObserverAction(false, "restart")).toBe("create");
    expect(nextThumbObserverAction(true, "restart")).toBe("restart");
  });
});
