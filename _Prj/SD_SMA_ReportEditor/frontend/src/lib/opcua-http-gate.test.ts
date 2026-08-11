import { describe, expect, it } from "vitest";
import { classifyOpcHttpPath } from "./opcua-http-gate";

describe("classifyOpcHttpPath", () => {
  it("keeps config CRUD ungated so delete/save cannot be blocked by bad browse", () => {
    expect(classifyOpcHttpPath("/opcua/servers")).toBe("ungated");
    expect(classifyOpcHttpPath("/opcua/servers/abc")).toBe("ungated");
  });

  it("isolates probe traffic from browse slots", () => {
    expect(classifyOpcHttpPath("/opcua/test")).toBe("probe");
    expect(classifyOpcHttpPath("/opcua/test_saved/x")).toBe("probe");
    expect(classifyOpcHttpPath("/opcua/ping_saved/x")).toBe("probe");
  });

  it("classifies address-space ops as browse", () => {
    expect(classifyOpcHttpPath("/opcua/browse_saved/x")).toBe("browse");
    expect(classifyOpcHttpPath("/opcua/read_saved/x")).toBe("browse");
    expect(classifyOpcHttpPath("/opcua/browse")).toBe("browse");
  });
});
