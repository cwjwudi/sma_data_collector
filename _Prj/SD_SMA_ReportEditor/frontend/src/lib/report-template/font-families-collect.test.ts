import { describe, expect, it } from "vitest";
import { collectFontFamiliesFromLayoutElements } from "@/lib/report-template/font-families-collect";
import {
  BUNDLED_CJK_FAMILY,
  checkFontFamiliesSync,
  formatFontPreflightWarnings,
  isBundledCjkFamily,
} from "@/lib/report-template/font-availability";

describe("font-families-collect", () => {
  it("collects explicit families and ignores empty", () => {
    const fams = collectFontFamiliesFromLayoutElements([
      { fontFamily: "Microsoft YaHei" } as never,
      { fontFamily: "" } as never,
      { fontFamily: 'SimSun, "Noto Sans SC"' } as never,
    ]);
    expect(fams).toEqual(["Microsoft YaHei", "SimSun"]);
  });
});

describe("font-availability", () => {
  it("treats Noto Sans SC as bundled", () => {
    expect(isBundledCjkFamily("Noto Sans SC")).toBe(true);
    expect(isBundledCjkFamily(BUNDLED_CJK_FAMILY)).toBe(true);
  });

  it("flags host-missing non-bundled fonts for fallback warning", () => {
    const r = checkFontFamiliesSync(["Microsoft YaHei", "Noto Sans SC"], () => false);
    expect(r[0]!.needsBundleFallback).toBe(true);
    expect(r[1]!.needsBundleFallback).toBe(false);
    const w = formatFontPreflightWarnings(r);
    expect(w[0]).toContain("Microsoft YaHei");
    expect(w[0]).toContain(BUNDLED_CJK_FAMILY);
  });
});
