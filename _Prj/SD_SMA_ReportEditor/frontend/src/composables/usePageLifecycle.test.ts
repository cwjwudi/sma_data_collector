import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePageLifecycle } from "@/composables/usePageLifecycle";

describe("usePageLifecycle (032)", () => {
  beforeEach(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("U-lifecycle: KeepAlive deactivate pauses and reactivate resumes", async () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const show = ref(true);

    const Child = defineComponent({
      name: "LifecycleProbe",
      setup() {
        const { register } = usePageLifecycle("LifecycleProbe");
        register({ id: "t1", scope: "page", pause, resume });
        return () => h("div", "probe");
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
    expect(resume.mock.calls.length).toBeGreaterThanOrEqual(1);

    const pauseBefore = pause.mock.calls.length;
    show.value = false;
    await nextTick();
    await flushPromises();
    expect(pause.mock.calls.length).toBeGreaterThan(pauseBefore);

    resume.mockClear();
    show.value = true;
    await nextTick();
    await flushPromises();
    expect(resume.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("U-lifecycle: page-focus pauses when document.hidden", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    const listeners = new Map<string, EventListener>();
    vi.spyOn(document, "addEventListener").mockImplementation((type, fn) => {
      listeners.set(String(type), fn as EventListener);
    });
    vi.spyOn(document, "removeEventListener").mockImplementation((type) => {
      listeners.delete(String(type));
    });

    const pause = vi.fn();
    const resume = vi.fn();
    const Comp = defineComponent({
      setup() {
        const { register } = usePageLifecycle("FocusProbe");
        register({ id: "poll", scope: "page-focus", pause, resume });
        return () => h("div");
      },
    });
    const wrapper = mount(Comp);
    await nextTick();

    hidden = true;
    listeners.get("visibilitychange")?.(new Event("visibilitychange"));
    expect(pause).toHaveBeenCalled();

    resume.mockClear();
    hidden = false;
    listeners.get("visibilitychange")?.(new Event("visibilitychange"));
    expect(resume).toHaveBeenCalled();

    wrapper.unmount();
  });
});
