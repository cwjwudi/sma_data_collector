/**
 * 将随包 Noto / 朱雀仿宋注册进 document.fonts，供 Mini 预览与 Chromium print 与矢量档同源。
 * Electron：IPC 读 extraResources/fonts；浏览器/单测：尝试 fetch /resources/fonts/*.ttf。
 */
import {
  BUNDLED_CJK_FAMILY,
  BUNDLED_FANGSONG_FAMILY,
  type BundledFontId,
} from "@/lib/report-template/font-availability";

const registered = new Set<string>();
let inflight: Promise<void> | null = null;

const FETCH_URLS: Record<BundledFontId, string[]> = {
  "noto-sans-sc": [
    "/resources/fonts/NotoSansSC-Regular.ttf",
    "./resources/fonts/NotoSansSC-Regular.ttf",
    "/resources/fonts/NotoSansSC-Regular.otf",
  ],
  fangsong: [
    "/resources/fonts/ZhuqueFangsong-Regular.ttf",
    "./resources/fonts/ZhuqueFangsong-Regular.ttf",
  ],
};

function familyForId(id: BundledFontId): string {
  return id === "fangsong" ? BUNDLED_FANGSONG_FAMILY : BUNDLED_CJK_FAMILY;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadBytesViaIpc(id: BundledFontId): Promise<Uint8Array | null> {
  try {
    const api = (
      window as unknown as {
        electronAPI?: {
          getBundledCjkFont?: (o: { key: string }) => Promise<{
            ok?: boolean;
            base64?: string;
          }>;
        };
      }
    ).electronAPI;
    const res = await api?.getBundledCjkFont?.({ key: id });
    if (res?.ok && res.base64 && res.base64.length > 1000) {
      return decodeBase64ToBytes(res.base64);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function loadBytesViaFetch(id: BundledFontId): Promise<Uint8Array | null> {
  for (const url of FETCH_URLS[id]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1000) return new Uint8Array(buf);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function registerOne(id: BundledFontId): Promise<void> {
  const family = familyForId(id);
  if (registered.has(family)) return;
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  try {
    if (document.fonts.check(`12px "${family}"`)) {
      registered.add(family);
      return;
    }
  } catch {
    /* continue load */
  }
  const bytes = (await loadBytesViaIpc(id)) || (await loadBytesViaFetch(id));
  if (!bytes) return;
  try {
    const face = new FontFace(family, bytes, { weight: "400", style: "normal" });
    await face.load();
    document.fonts.add(face);
    registered.add(family);
  } catch {
    /* 坏字体 / 环境不支持则跳过 */
  }
}

/** 幂等；可在应用启动与导出预览前调用 */
export async function ensureBundledLayoutFontsRegistered(): Promise<void> {
  if (typeof document === "undefined") return;
  if (inflight) return inflight;
  inflight = (async () => {
    await registerOne("noto-sans-sc");
    await registerOne("fangsong");
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
