import { describe, expect, it } from "vitest";
import { parseGeomInput } from "@/lib/report-template/deferred-geom-input";

describe("parseGeomInput", () => {
  it("parses finite numbers", () => {
    expect(parseGeomInput("150")).toBe(150);
    expect(parseGeomInput(" 12.5 ")).toBe(12.5);
    expect(parseGeomInput("-3")).toBe(-3);
  });

  it("returns null for incomplete or invalid drafts", () => {
    expect(parseGeomInput("")).toBeNull();
    expect(parseGeomInput("-")).toBeNull();
    expect(parseGeomInput(".")).toBeNull();
    expect(parseGeomInput("abc")).toBeNull();
  });
});
