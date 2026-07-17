/** AI FAB / 展开态对话窗浮动位置（本机 localStorage）。 */

export const AI_FAB_POS_KEY = 'report-editor-ai-fab-pos'
export const AI_DRAWER_POS_KEY = 'report-editor-ai-drawer-pos'

export const FLOATING_EDGE_PAD = 8
export const DRAG_CLICK_THRESHOLD_PX = 5

/** 与 `.ai-fab` 默认尺寸一致 */
export const AI_FAB_SIZE = { width: 72, height: 72 } as const
/** 与 `.ai-fab` 默认 `right` / `bottom` 一致 */
export const AI_FAB_DEFAULT_RIGHT = 28
export const AI_FAB_DEFAULT_BOTTOM = 20

export type FloatingPos = { left: number; top: number }
export type Size = { width: number; height: number }
export type Viewport = { width: number; height: number }

export function isDragNotClick(
  dx: number,
  dy: number,
  threshold = DRAG_CLICK_THRESHOLD_PX,
): boolean {
  return Math.hypot(dx, dy) > threshold
}

export function clampFloatingPos(
  pos: FloatingPos,
  size: Size,
  viewport: Viewport,
  pad = FLOATING_EDGE_PAD,
): FloatingPos {
  const maxLeft = Math.max(pad, viewport.width - size.width - pad)
  const maxTop = Math.max(pad, viewport.height - size.height - pad)
  const left = Number.isFinite(pos.left) ? pos.left : pad
  const top = Number.isFinite(pos.top) ? pos.top : pad
  return {
    left: Math.min(maxLeft, Math.max(pad, Math.round(left))),
    top: Math.min(maxTop, Math.max(pad, Math.round(top))),
  }
}

export function defaultFabPos(
  viewport: Viewport,
  fabSize: Size = AI_FAB_SIZE,
): FloatingPos {
  return clampFloatingPos(
    {
      left: viewport.width - fabSize.width - AI_FAB_DEFAULT_RIGHT,
      top: viewport.height - fabSize.height - AI_FAB_DEFAULT_BOTTOM,
    },
    fabSize,
    viewport,
  )
}

export function defaultExpandedDrawerPos(viewport: Viewport, size: Size): FloatingPos {
  return clampFloatingPos(
    {
      left: (viewport.width - size.width) / 2,
      top: (viewport.height - size.height) / 2,
    },
    size,
    viewport,
  )
}

export function loadFloatingPos(
  key: string,
  storage: Storage = localStorage,
): FloatingPos | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<FloatingPos>
    if (!data || !Number.isFinite(data.left) || !Number.isFinite(data.top)) return null
    return { left: Number(data.left), top: Number(data.top) }
  } catch {
    return null
  }
}

export function saveFloatingPos(
  key: string,
  pos: FloatingPos,
  storage: Storage = localStorage,
): void {
  storage.setItem(key, JSON.stringify({ left: Math.round(pos.left), top: Math.round(pos.top) }))
}

export function clearFloatingPos(key: string, storage: Storage = localStorage): void {
  storage.removeItem(key)
}

export function clearAiFloatingPositions(storage: Storage = localStorage): void {
  clearFloatingPos(AI_FAB_POS_KEY, storage)
  clearFloatingPos(AI_DRAWER_POS_KEY, storage)
}
