/** MiniPreviewChrome 内边距与描边占宽，避免缩略图撑破模版管理格子 */
export const MINI_PREVIEW_CHROME_W_INSET = 14;
export const MINI_PREVIEW_CHROME_H_INSET = 10;

/** 在 max 宽高内等比缩放，不超过 1 */
export function miniPreviewScale(
  maxWidthPx: number,
  maxHeightPx: number,
  contentW: number,
  contentH: number,
): number {
  const sx = (maxWidthPx - MINI_PREVIEW_CHROME_W_INSET) / Math.max(1, contentW);
  const sy = (maxHeightPx - MINI_PREVIEW_CHROME_H_INSET) / Math.max(1, contentH);
  return Math.min(sx, sy, 1);
}
