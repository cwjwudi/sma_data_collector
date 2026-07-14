/**
 * 多选对齐 / 分布（011 · B2）
 * 只产出新的 x/y；不改宽高。
 */

export type AlignKind = "left" | "right" | "top" | "bottom" | "centerH" | "centerV";
export type DistributeKind = "horizontal" | "vertical";

export type AlignBox = { id: string; x: number; y: number; w: number; h: number };

export type PosPatch = { id: string; x: number; y: number };

function unionBox(boxes: readonly AlignBox[]): { x: number; y: number; w: number; h: number } | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function resolveBase(
  boxes: readonly AlignBox[],
  primaryId: string | null | undefined,
): { x: number; y: number; w: number; h: number } | null {
  if (primaryId) {
    const p = boxes.find((b) => b.id === primaryId);
    if (p) return { x: p.x, y: p.y, w: p.w, h: p.h };
  }
  return unionBox(boxes);
}

/** 对齐：选中 &lt; 2 返回空。基准优先 primary，否则外接矩形。 */
export function computeAlignPatches(
  boxes: readonly AlignBox[],
  kind: AlignKind,
  primaryId: string | null | undefined,
): PosPatch[] {
  if (boxes.length < 2) return [];
  const base = resolveBase(boxes, primaryId);
  if (!base) return [];
  const out: PosPatch[] = [];
  for (const b of boxes) {
    let x = b.x;
    let y = b.y;
    switch (kind) {
      case "left":
        x = base.x;
        break;
      case "right":
        x = base.x + base.w - b.w;
        break;
      case "top":
        y = base.y;
        break;
      case "bottom":
        y = base.y + base.h - b.h;
        break;
      case "centerH":
        x = base.x + base.w / 2 - b.w / 2;
        break;
      case "centerV":
        y = base.y + base.h / 2 - b.h / 2;
        break;
      default:
        break;
    }
    if (x !== b.x || y !== b.y) out.push({ id: b.id, x, y });
  }
  return out;
}

/**
 * 分布：选中 &lt; 3 返回空。
 * 两端外缘不动，中间按边距等分（水平用左右外缘，垂直用上下外缘）。
 */
export function computeDistributePatches(
  boxes: readonly AlignBox[],
  kind: DistributeKind,
): PosPatch[] {
  if (boxes.length < 3) return [];
  const sorted =
    kind === "horizontal"
      ? [...boxes].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
      : [...boxes].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));

  const out: PosPatch[] = [];
  if (kind === "horizontal") {
    const left0 = sorted[0].x;
    const rightN = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w;
    const sumW = sorted.reduce((s, b) => s + b.w, 0);
    const gap = (rightN - left0 - sumW) / (sorted.length - 1);
    let cursor = left0;
    for (const b of sorted) {
      const x = cursor;
      if (x !== b.x) out.push({ id: b.id, x, y: b.y });
      cursor += b.w + gap;
    }
  } else {
    const top0 = sorted[0].y;
    const bottomN = sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
    const sumH = sorted.reduce((s, b) => s + b.h, 0);
    const gap = (bottomN - top0 - sumH) / (sorted.length - 1);
    let cursor = top0;
    for (const b of sorted) {
      const y = cursor;
      if (y !== b.y) out.push({ id: b.id, x: b.x, y });
      cursor += b.h + gap;
    }
  }
  return out;
}

export function canAlign(count: number): boolean {
  return count >= 2;
}

export function canDistribute(count: number): boolean {
  return count >= 3;
}
