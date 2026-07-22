/**
 * 字体可用性：本机 document.fonts + 随包开源 CJK。
 * 微软雅黑/微软仿宋等未随包携带；缺字时预检 warning，导出回退随包字体。
 * 仿宋 UI 族名 FangSong → 随包朱雀仿宋（OFL），非微软仿宋。
 */
export const BUNDLED_CJK_FAMILY = "Noto Sans SC";
/** UI / 模版常用族名；物理文件为朱雀仿宋 */
export const BUNDLED_FANGSONG_FAMILY = "FangSong";

export type BundledFontId = "noto-sans-sc" | "fangsong";

const NOTO_ALIASES = new Set(
  ["Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Source Han Sans CN"].map((s) =>
    s.toLowerCase(),
  ),
);

const FANGSONG_ALIASES = new Set(
  ["FangSong", "仿宋", "Zhuque Fangsong", "朱雀仿宋", "ZhuqueFangsong"].map((s) => s.toLowerCase()),
);

export function resolveBundledFontId(family: string): BundledFontId | null {
  const f = family.trim().toLowerCase();
  if (!f) return null;
  if (NOTO_ALIASES.has(f)) return "noto-sans-sc";
  if (FANGSONG_ALIASES.has(f)) return "fangsong";
  return null;
}

export function isBundledCjkFamily(family: string): boolean {
  return resolveBundledFontId(family) != null;
}

export function bundledFamilyLabel(id: BundledFontId): string {
  return id === "fangsong" ? BUNDLED_FANGSONG_FAMILY : BUNDLED_CJK_FAMILY;
}

/** 导出嵌入：模版显式用了仿宋则嵌仿宋，否则默认 Noto */
export function pickBundledFontForExport(families: string[]): {
  id: BundledFontId;
  family: string;
} {
  for (const raw of families) {
    if (resolveBundledFontId(raw) === "fangsong") {
      return { id: "fangsong", family: BUNDLED_FANGSONG_FAMILY };
    }
  }
  return { id: "noto-sans-sc", family: BUNDLED_CJK_FAMILY };
}

export type FontAvailabilityResult = {
  family: string;
  availableOnHost: boolean;
  coveredByBundle: boolean;
  /** 本机没有且需依赖随包回退 */
  needsBundleFallback: boolean;
};

export function checkFontFamilySync(
  family: string,
  hostChecker: (cssFont: string) => boolean,
): FontAvailabilityResult {
  const f = family.trim();
  const coveredByBundle = isBundledCjkFamily(f);
  let availableOnHost = false;
  try {
    availableOnHost = hostChecker(`12px "${f}"`);
  } catch {
    availableOnHost = false;
  }
  return {
    family: f,
    availableOnHost,
    coveredByBundle,
    needsBundleFallback: !availableOnHost && !coveredByBundle,
  };
}

export function checkFontFamiliesSync(
  families: string[],
  hostChecker: (cssFont: string) => boolean = defaultHostFontCheck,
): FontAvailabilityResult[] {
  return families.map((f) => checkFontFamilySync(f, hostChecker));
}

function defaultHostFontCheck(cssFont: string): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return false;
  return document.fonts.check(cssFont);
}

/** 导出预检用的 warning 文案 */
export function formatFontPreflightWarnings(results: FontAvailabilityResult[]): string[] {
  const missing = results.filter((r) => r.needsBundleFallback);
  if (!missing.length) return [];
  const names = missing.map((r) => r.family).join("、");
  return [
    `模版/版式使用了本机可能不可用的字体：${names}。导出将回退到随包「${BUNDLED_CJK_FAMILY}」或「${BUNDLED_FANGSONG_FAMILY}」（不随包分发微软雅黑/微软仿宋）。`,
  ];
}
