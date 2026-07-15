/** MiniPreviewChrome 内边距与描边占宽，避免缩略图撑破模版管理格子 */
export const MINI_PREVIEW_CHROME_W_INSET = 14;
export const MINI_PREVIEW_CHROME_H_INSET = 10;

export type MiniPreviewScaleOpts = {
  /**
   * 是否为列表 chrome 预留 inset。
   * 导出 PDF（019）须为 false，否则内容欠缩放留白衬边。
   * @default true
   */
  chromeInset?: boolean;
};

/** 在 max 宽高内等比缩放，不超过 1 */
export function miniPreviewScale(
  maxWidthPx: number,
  maxHeightPx: number,
  contentW: number,
  contentH: number,
  opts?: MiniPreviewScaleOpts,
): number {
  const useInset = opts?.chromeInset !== false;
  const insetW = useInset ? MINI_PREVIEW_CHROME_W_INSET : 0;
  const insetH = useInset ? MINI_PREVIEW_CHROME_H_INSET : 0;
  const sx = (maxWidthPx - insetW) / Math.max(1, contentW);
  const sy = (maxHeightPx - insetH) / Math.max(1, contentH);
  return Math.min(sx, sy, 1);
}

/** PDF 导出：不扣列表 chrome inset，便于 scale=1 铺满 @page */
export function miniPreviewScaleForExport(
  maxWidthPx: number,
  maxHeightPx: number,
  contentW: number,
  contentH: number,
): number {
  return miniPreviewScale(maxWidthPx, maxHeightPx, contentW, contentH, { chromeInset: false });
}
