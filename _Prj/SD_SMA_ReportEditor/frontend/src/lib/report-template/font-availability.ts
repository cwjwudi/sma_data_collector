/**
 * 字体可用性：本机 document.fonts + 随包 Noto 回退族名。
 * 微软雅黑等未随包携带；缺字时预检 warning，导出回退 BUNDLED_CJK_FAMILY。
 */
export const BUNDLED_CJK_FAMILY = "Noto Sans SC";

/** 视为「已由安装包保证」的族名（大小写不敏感匹配） */
const BUNDLED_ALIASES = new Set(
  ["Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Source Han Sans CN"].map((s) =>
    s.toLowerCase(),
  ),
);

export function isBundledCjkFamily(family: string): boolean {
  return BUNDLED_ALIASES.has(family.trim().toLowerCase());
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
    `模版/版式使用了本机可能不可用的字体：${names}。导出将回退到随包「${BUNDLED_CJK_FAMILY}」（不随包分发微软雅黑/宋体）。`,
  ];
}
