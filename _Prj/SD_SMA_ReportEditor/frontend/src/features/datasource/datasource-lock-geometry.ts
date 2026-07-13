/** 数据源滑动锁：轨道 / 滑块 / 进度条几何（纯函数，供组件与单测共用） */

export const LOCK_TRACK_W = 200
export const LOCK_TRACK_H = 40
export const LOCK_THUMB = 32
export const LOCK_THUMB_PAD = 4
export const LOCK_THUMB_TRAVEL = LOCK_TRACK_W - LOCK_THUMB - LOCK_THUMB_PAD * 2

/** 拖到解锁端（左）判定阈值 */
export const UNLOCK_PCT_MAX = 28
/** 拖到锁定端（右）判定阈值 */
export const LOCK_PCT_MIN = 72

export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(100, Math.max(0, pct))
}

/** 滑块左缘相对轨道左缘的 px（与 progress 共用同一套 pct→位移） */
export function thumbOffsetPx(pct: number): number {
  return LOCK_THUMB_PAD + (clampPct(pct) / 100) * LOCK_THUMB_TRAVEL
}

/**
 * 进度填充宽度（px）：对齐到滑块中心，避免「fill 用全轨 %、滑块用 travel」造成不同步。
 */
export function fillWidthPx(pct: number): number {
  return thumbOffsetPx(pct) + LOCK_THUMB / 2
}

/**
 * 指针位置 → 进度 %。按滑块中心可走区间映射，使拖柄中心与指针重合时 pct 一致。
 */
export function pctFromClientX(clientX: number, trackLeft: number, trackWidth: number): number {
  if (!(trackWidth > 0)) return 0
  const centerMin = LOCK_THUMB_PAD + LOCK_THUMB / 2
  const centerMax = trackWidth - LOCK_THUMB_PAD - LOCK_THUMB / 2
  if (centerMax <= centerMin) return 0
  const x = Math.min(Math.max(clientX - trackLeft, centerMin), centerMax)
  return ((x - centerMin) / (centerMax - centerMin)) * 100
}

export function wantUnlockAt(pct: number): boolean {
  return clampPct(pct) <= UNLOCK_PCT_MAX
}

export function wantLockAt(pct: number): boolean {
  return clampPct(pct) >= LOCK_PCT_MIN
}
