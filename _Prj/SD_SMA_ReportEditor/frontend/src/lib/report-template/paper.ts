/** ISO / 常用纸张（mm），及屏幕预览用像素换算（96 CSS px ≈ 1 inch） */

export type PaperKind = "A3" | "A4" | "A5" | "Letter";

export interface PaperDimensionsMm {
  widthMm: number;
  heightMm: number;
}

export const PAPER_LABEL: Record<PaperKind, string> = {
  A3: "A3（297×420 mm）",
  A4: "A4（210×297 mm）",
  A5: "A5（148×210 mm）",
  Letter: "Letter（216×279 mm）",
};

export const PAPER_KIND_SHORT: Record<PaperKind, string> = {
  A3: "A3",
  A4: "A4",
  A5: "A5",
  Letter: "Letter",
};

export const PAPER_PRESETS: Record<PaperKind, PaperDimensionsMm> = {
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  Letter: { widthMm: 216, heightMm: 279 },
};

/** CSS 像素（96dpi 惯例） */
export function mmToCssPx(mm: number): number {
  return Math.round((mm * 96) / 25.4);
}

export function getPaperPageCssPx(
  kind: PaperKind,
  orientation: "portrait" | "landscape",
): { widthPx: number; heightPx: number } {
  const d = PAPER_PRESETS[kind];
  const wmm = orientation === "portrait" ? d.widthMm : d.heightMm;
  const hmm = orientation === "portrait" ? d.heightMm : d.widthMm;
  return { widthPx: mmToCssPx(wmm), heightPx: mmToCssPx(hmm) };
}
