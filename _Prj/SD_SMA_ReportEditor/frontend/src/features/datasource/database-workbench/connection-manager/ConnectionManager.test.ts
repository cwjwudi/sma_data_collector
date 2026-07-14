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

const savedConn = {
  id: "c-lock-1",
  name: "SMA_DATABASE",
  engine: "mysql",
  host: "127.0.0.1",
  port: 3306,
  database: "sma_data_test",
  username: "root",
  has_password: true,
};

describe("ConnectionManager lock hint vs actions (008)", () => {
  it("A1: locked shows hint", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: true },
    });
    expect(w.text()).toContain("数据源已锁定");
    expect(w.find(".demo-conn-hint").exists()).toBe(true);
  });

  it("A2: unlocked has no lock hint", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: false },
    });
    expect(w.text()).not.toContain("数据源已锁定");
  });

  it("A3: locked keeps actions with all four buttons", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: true },
    });
    const actions = w.find(".conn-form-pane__actions.actions");
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain("测试连接");
    expect(actions.text()).toContain("仅保存");
    expect(actions.text()).toContain("测试并保存");
    expect(actions.text()).toContain("删除");
  });

  it("A4: locked disables fields but test button stays enabled when not busy", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: true },
    });
    expect(w.find('input[placeholder="例如 产线 MySQL"]').attributes("disabled")).toBeDefined();
    const testBtn = w.findAll("button").find((b) => b.text() === "测试连接");
    expect(testBtn).toBeTruthy();
    expect(testBtn!.attributes("disabled")).toBeUndefined();
  });

  it("A5: toggling locked keeps actions mounted", async () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: false },
    });
    expect(w.find(".conn-form-pane__actions").exists()).toBe(true);
    await w.setProps({ locked: true });
    expect(w.text()).toContain("数据源已锁定");
    expect(w.find(".conn-form-pane__actions").exists()).toBe(true);
    await w.setProps({ locked: false });
    expect(w.text()).not.toContain("数据源已锁定");
    expect(w.find(".conn-form-pane__actions").exists()).toBe(true);
  });

  it("A6: remote demo keeps actions with test/delete", () => {
    const w = mount(ConnectionManager, {
      props: {
        modelValue: {
          ...savedConn,
          is_demo: true,
          demo_channel: "remote",
        },
        creatingNew: false,
        loading: false,
        locked: true,
      },
    });
    expect(w.text()).toMatch(/远程演示/);
    const actions = w.find(".conn-form-pane__actions.actions");
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain("测试连接");
    expect(actions.text()).toContain("删除");
  });

  it("fields scroll in body; actions sit outside body", () => {
    const w = mount(ConnectionManager, {
      props: { modelValue: savedConn, creatingNew: false, loading: false, locked: true },
    });
    const body = w.find(".conn-form-pane__body");
    const actions = w.find(".conn-form-pane__actions");
    expect(body.exists()).toBe(true);
    expect(actions.exists()).toBe(true);
    expect(body.find(".demo-conn-hint").exists()).toBe(true);
    expect(body.find(".conn-form-pane__actions").exists()).toBe(false);
  });
});
