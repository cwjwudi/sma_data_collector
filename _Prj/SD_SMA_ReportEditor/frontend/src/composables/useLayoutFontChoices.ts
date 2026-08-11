import { computed, ref, shallowRef } from "vue";
import {
  BUNDLED_CJK_FAMILY,
  BUNDLED_FANGSONG_FAMILY,
} from "@/lib/report-template/font-availability";

/** 跨平台常见字体（无法枚举本机时仍可快速选）；自带字体置顶见 options */
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

/** 软件自带默认字体族名（与随包 OTF / pdf-lib 嵌入一致） */
export const DEFAULT_LAYOUT_FONT_FAMILY = BUNDLED_CJK_FAMILY;

/** 软件自带仿宋（朱雀仿宋；UI 族名 FangSong） */
export const BUNDLED_LAYOUT_FANGSONG_FAMILY = BUNDLED_FANGSONG_FAMILY;

type FontAccessWindow = Window & {
  queryLocalFonts?: () => Promise<Iterable<{ family?: string; fullName?: string }>>;
};

export function useLayoutFontChoices() {
  const fromOs = shallowRef<string[]>([]);
  const loading = ref(false);
  const hint = ref("");
  const lastOsCount = ref(0);

  const options = computed(() => {
    const pinned = [DEFAULT_LAYOUT_FONT_FAMILY, BUNDLED_LAYOUT_FANGSONG_FAMILY];
    const s = new Set<string>([...pinned, ...LAYOUT_FONT_FALLBACK, ...fromOs.value]);
    for (const x of Array.from(s)) {
      if (!x || !String(x).trim()) s.delete(x);
    }
    const rest = Array.from(s)
      .filter((x) => !pinned.includes(x))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    // Noto（默认）+ FangSong（自带）置顶
    return [...pinned, ...rest];
  });

  async function refresh() {
    const w = window as FontAccessWindow;
    const q = w.queryLocalFonts;
    if (typeof q !== "function") {
      hint.value =
        "当前环境不支持列举本机字体。仍可使用常见字体列表，或直接输入字体名（如 Microsoft YaHei）。";
      return;
    }
    loading.value = true;
    hint.value = "";
    try {
      // 须由用户点击触发；Electron 需放行 local-fonts 权限
      const fonts = await q.call(w);
      const fam = new Set<string>();
      for (const f of fonts) {
        const n = typeof f?.family === "string" ? f.family.trim() : "";
        if (n) fam.add(n);
      }
      fromOs.value = Array.from(fam);
      lastOsCount.value = fam.size;
      if (fam.size === 0) {
        hint.value =
          "本机字体枚举结果为空（可能未授权 local-fonts）。已保留常见字体列表，也可直接输入字体名。";
      } else {
        hint.value = `已加载 ${fam.size} 个本机字体族（含常见字体共 ${options.value.length} 项）。展开下拉可滚动浏览；输入可过滤。`;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      hint.value = `${msg}（请点击「刷新本机字体列表」并允许访问字体；也可直接输入字体名。）`;
    } finally {
      loading.value = false;
    }
  }

  return { options, loading, hint, refresh, lastOsCount };
}
