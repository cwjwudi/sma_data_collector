import { describe, expect, it } from "vitest";
import {
  BUNDLED_LAYOUT_FANGSONG_FAMILY,
  DEFAULT_LAYOUT_FONT_FAMILY,
} from "@/composables/useLayoutFontChoices";
import {
  BUNDLED_CJK_FAMILY,
  BUNDLED_FANGSONG_FAMILY,
} from "@/lib/report-template/font-availability";

describe("useLayoutFontChoices default font (033 Q2/Q3)", () => {
  it("DEFAULT_LAYOUT_FONT_FAMILY is bundled Noto Sans SC", () => {
    expect(DEFAULT_LAYOUT_FONT_FAMILY).toBe("Noto Sans SC");
    expect(DEFAULT_LAYOUT_FONT_FAMILY).toBe(BUNDLED_CJK_FAMILY);
  });

  it("FangSong is also a bundled layout family", () => {
    expect(BUNDLED_LAYOUT_FANGSONG_FAMILY).toBe("FangSong");
    expect(BUNDLED_LAYOUT_FANGSONG_FAMILY).toBe(BUNDLED_FANGSONG_FAMILY);
  });
});
