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
});
