/** 列宽拖拽：屏幕位移 → 布局像素，保留亚像素余数（高缩放细调）。 */

/**
 * 将一次屏幕位移累加进余数，仅当凑满整布局像素时发出整数 delta。
 * `Math.round` 余数回写，避免 2.8× 等缩放下每步 <0.5px 被 round 永久丢弃。
 */
export function takeLayoutDeltaFromScreen(
  accumLayoutPx: number,
  screenDxPx: number,
  layoutScale: number,
): { emitDx: number; nextAccum: number } {
  const sc = layoutScale > 0 && Number.isFinite(layoutScale) ? layoutScale : 1;
  const next = (Number.isFinite(accumLayoutPx) ? accumLayoutPx : 0) + screenDxPx / sc;
  const emitDx = Math.round(next);
  if (emitDx === 0) return { emitDx: 0, nextAccum: next };
  return { emitDx, nextAccum: next - emitDx };
}
