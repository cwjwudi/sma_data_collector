/**
 * 多选组缩放（020）
 * 相对选中并集 AABB，以对角/对边为锚等比变换各控件 x/y/w/h。
 */

export type GroupResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type GroupResizeOrigin = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 表格等：只跟水平缩放，高度保持原点 */
  horizontalOnly?: boolean;
  minW?: number;
  minH?: number;
};

export type GroupResizeAabb = { x: number; y: number; w: number; h: number };

export type GroupResizeResult = { id: string; x: number; y: number; w: number; h: number };

export function unionAabb(
  rects: readonly { x: number; y: number; w: number; h: number }[],
): GroupResizeAabb | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of rects) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/** 只回推位置，不因越界砍 w/h（组拖移保尺寸） */
export function clampPositionOnly(
  el: { x: number; y: number; w: number; h: number },
  contentW: number,
  contentH: number,
): void {
  const w = Math.max(1, el.w);
  const h = Math.max(1, el.h);
  el.w = w;
  el.h = h;
  el.x = Math.max(0, Math.min(el.x, Math.max(0, contentW - w)));
  el.y = Math.max(0, Math.min(el.y, Math.max(0, contentH - h)));
}

function anchorAndScale(
  aabb: GroupResizeAabb,
  handle: string,
  dx: number,
  dy: number,
  lockAspect: boolean,
): { ax: number; ay: number; sx: number; sy: number } {
  const { x, y, w, h } = aabb;
  let ax = x;
  let ay = y;
  let nw = w;
  let nh = h;

  if (handle.includes("e")) {
    ax = x;
    nw = w + dx;
  } else if (handle.includes("w")) {
    ax = x + w;
    nw = w - dx;
  } else {
    ax = x;
    nw = w;
  }

  if (handle.includes("s")) {
    ay = y;
    nh = h + dy;
  } else if (handle.includes("n")) {
    ay = y + h;
    nh = h - dy;
  } else {
    ay = y;
    nh = h;
  }

  // 纯水平/竖直柄：对轴 scale=1
  const horizontalOnlyHandle = handle === "e" || handle === "w";
  const verticalOnlyHandle = handle === "n" || handle === "s";

  let sx = nw / w;
  let sy = nh / h;
  if (horizontalOnlyHandle) sy = 1;
  if (verticalOnlyHandle) sx = 1;

  if (lockAspect) {
    if (horizontalOnlyHandle) {
      sy = sx;
    } else if (verticalOnlyHandle) {
      sx = sy;
    } else {
      const s = Math.abs(dx) >= Math.abs(dy) ? sx : sy;
      sx = s;
      sy = s;
    }
  }

  // 禁止翻转成负尺寸
  sx = Math.max(1e-6, sx);
  sy = Math.max(1e-6, sy);

  return { ax, ay, sx, sy };
}

function clampScalesToMins(
  origins: readonly GroupResizeOrigin[],
  sx: number,
  sy: number,
  defaultMinW: number,
  defaultMinH: number,
): { sx: number; sy: number } {
  let outSx = sx;
  let outSy = sy;
  for (const o of origins) {
    const minW = o.minW ?? defaultMinW;
    const minH = o.minH ?? defaultMinH;
    if (o.w > 0) outSx = Math.max(outSx, minW / o.w);
    if (!o.horizontalOnly && o.h > 0) outSy = Math.max(outSy, minH / o.h);
  }
  return { sx: outSx, sy: outSy };
}

/**
 * 组缩放：origins 为按下时快照；返回各 id 新几何。
 * 选中 &lt; 2 时仍可调用（等价于变换单个 AABB）。
 */
export function applyGroupResize(
  origins: readonly GroupResizeOrigin[],
  handle: GroupResizeHandle | string,
  dx: number,
  dy: number,
  opts?: {
    lockAspect?: boolean;
    defaultMinW?: number;
    defaultMinH?: number;
  },
): GroupResizeResult[] {
  const aabb = unionAabb(origins);
  if (!aabb || !origins.length) return [];

  const defaultMinW = opts?.defaultMinW ?? 20;
  const defaultMinH = opts?.defaultMinH ?? 20;
  let { ax, ay, sx, sy } = anchorAndScale(aabb, handle, dx, dy, !!opts?.lockAspect);
  ({ sx, sy } = clampScalesToMins(origins, sx, sy, defaultMinW, defaultMinH));

  return origins.map((o) => {
    const nw = Math.max(o.minW ?? defaultMinW, Math.round(o.w * sx));
    const nh = o.horizontalOnly
      ? o.h
      : Math.max(o.minH ?? defaultMinH, Math.round(o.h * sy));
    const nx = Math.round(ax + (o.x - ax) * sx);
    const ny = Math.round(ay + (o.y - ay) * sy);
    return { id: o.id, x: nx, y: ny, w: nw, h: nh };
  });
}
