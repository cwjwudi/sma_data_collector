import { computed, ref, shallowRef } from "vue";

/** 跨平台常见字体（无法枚举本机时仍可快速选） */
export const LAYOUT_FONT_FALLBACK = [
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Microsoft YaHei UI",
  "Microsoft YaHei",
  "PingFang SC",
  "Hiragino Sans GB",
  "Noto Sans CJK SC",
  "Source Han Sans SC",
  "SimSun",
  "NSimSun",
  "SimHei",
  "KaiTi",
  "FangSong",
  "Arial",
  "Arial Unicode MS",
  "Times New Roman",
  "Georgia",
  "Consolas",
  "Courier New",
] as const;

type FontAccessWindow = Window & {
  queryLocalFonts?: () => Promise<Iterable<{ family?: string; fullName?: string }>>;
};

export function useLayoutFontChoices() {
  const fromOs = shallowRef<string[]>([]);
  const loading = ref(false);
  const hint = ref("");

  const options = computed(() => {
    const s = new Set<string>([...LAYOUT_FONT_FALLBACK, ...fromOs.value]);
    for (const x of Array.from(s)) {
      if (!x || !String(x).trim()) s.delete(x);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "zh-CN"));
  });

  async function refresh() {
    const w = window as FontAccessWindow;
    const q = w.queryLocalFonts;
    if (typeof q !== "function") {
      hint.value =
        "当前浏览器不支持列举本机字体（需 Chromium / Electron 等且为安全上下文）。可直接输入字体名，或使用上方列表中的常见字体。";
      return;
    }
    loading.value = true;
    hint.value = "";
    try {
      const fonts = await q.call(w);
      const fam = new Set<string>();
      for (const f of fonts) {
        const n = typeof f?.family === "string" ? f.family.trim() : "";
        if (n) fam.add(n);
      }
      fromOs.value = Array.from(fam);
    } catch (e) {
      hint.value =
        (e instanceof Error ? e.message : String(e)) +
        "（若首次使用，请在浏览器权限提示中允许访问本机字体。）";
    } finally {
      loading.value = false;
    }
  }

  return { options, loading, hint, refresh };
}
