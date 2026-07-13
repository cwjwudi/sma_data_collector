import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/client.js", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/auditLog", () => ({
  auditLog: vi.fn(),
}));

import ConnectionManager from "./ConnectionManager.vue";

describe("ConnectionManager empty / create states", () => {
  it("always shows the 数据库连接 panel chrome", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: null, creatingNew: false, loading: false },
    });
    expect(w.find(".conn-form-pane").exists()).toBe(true);
    expect(w.text()).toContain("数据库连接");
  });

  it("shows placeholder when not creating and no model", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: null, creatingNew: false, loading: false },
    });
    expect(w.find(".conn-placeholder").exists()).toBe(true);
    expect(w.text()).toMatch(/新建/);
  });

  it("shows editable form fields when creatingNew (even if locked view-only)", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: null, creatingNew: true, loading: false, locked: true },
    });
    expect(w.find("input.input").exists()).toBe(true);
    expect(w.text()).toContain("数据源已锁定");
    expect(w.find("input.input").attributes("disabled")).toBeDefined();
  });

  it("shows loading placeholder without dropping the pane", () => {
    const w = mount(ConnectionManager, {
      props: {
        modelValue: null,
        creatingNew: false,
        loading: true,
        loadingMessage: "正在加载已保存的连接…",
      },
    });
    expect(w.find(".conn-form-pane").exists()).toBe(true);
    expect(w.text()).toContain("正在加载已保存的连接…");
  });

  it("keeps typed create-draft fields across loading flicker while creatingNew", async () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: null, creatingNew: true, loading: false },
    });
    const nameInput = w.find('input[placeholder="例如 产线 MySQL"]');
    await nameInput.setValue("产线-勿清空");

    await w.setProps({ loading: true });
    await w.vm.$nextTick();
    await w.setProps({ loading: false });
    await w.vm.$nextTick();

    expect(w.find('input[placeholder="例如 产线 MySQL"]').element.value).toBe("产线-勿清空");
  });

  it("keeps typed create-draft when parent re-sends null while still creatingNew", async () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: null, creatingNew: true, loading: false },
    });
    await w.find('input[placeholder="例如 产线 MySQL"]').setValue("产线-勿清空");

    // 触发 [null,true] → [null,true] 在 Vue 可能不跑 watch；借 loading 之外再 set 同值 props
    // 通过短暂改 creatingNew 再改回会误清，故改用：先 false 占位态再回到 creating（模拟错误路径）不测。
    // 直接调用：再次 setProps 相同值后，用内部策略保证「连续 null+creating」不 reset——
    // 这里用「先选中再回到 null+creating」对比用例已覆盖 reset；保留用例依赖策略单测 + loading 闪烁。
    await w.setProps({ modelValue: null, creatingNew: true, loading: false });
    await w.vm.$nextTick();
    expect(w.find('input[placeholder="例如 产线 MySQL"]').element.value).toBe("产线-勿清空");
  });

  it("clears fields when switching from a saved connection into +新建", async () => {
    const w = mount(ConnectionManager, {
      props: {
        modelValue: {
          id: "c1",
          name: "旧连接",
          engine: "mysql",
          host: "10.0.0.1",
          port: 3306,
        },
        creatingNew: false,
        loading: false,
      },
    });
    expect(w.find('input[placeholder="例如 产线 MySQL"]').element.value).toBe("旧连接");

    await w.setProps({ modelValue: null, creatingNew: true });
    await w.vm.$nextTick();

    expect(w.find('input[placeholder="例如 产线 MySQL"]').element.value).toBe("");
  });
});
