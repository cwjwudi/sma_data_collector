/**
 * 编辑器多选集合纯函数（011 · B1）
 * selectedIds 有序；末项 = primary。
 */

export type Rect = { x: number; y: number; w: number; h: number };

export function primaryId(selectedIds: readonly string[]): string | null {
  if (!selectedIds.length) return null;
  return selectedIds[selectedIds.length - 1] ?? null;
}

export function clearSelection(): string[] {
  return [];
}

/** 单击替换为单选 */
export function selectOnly(id: string): string[] {
  return id ? [id] : [];
}

/**
 * Ctrl/Cmd 切换：已在集合则移除；否则追加为 primary（末项）。
 * 移除后若集合非空，primary 仍为末项。
 */
export function toggleInSelection(selectedIds: readonly string[], id: string): string[] {
  if (!id) return [...selectedIds];
  const idx = selectedIds.indexOf(id);
  if (idx >= 0) {
    const next = selectedIds.filter((_, i) => i !== idx);
    return next;
  }
  return [...selectedIds, id];
}

/**
 * 同层有序列表内，从锚点到目标做闭区间选中（含两端）。
 * 锚点缺失时退化为 selectOnly(targetId)。
 * 点击端（targetId）置于末项作为 primary。
 */
export function rangeSelectInList(
  orderedIds: readonly string[],
  anchorId: string | null | undefined,
  targetId: string,
): string[] {
  if (!targetId) return [];
  const ti = orderedIds.indexOf(targetId);
  if (ti < 0) return selectOnly(targetId);
  const ai = anchorId ? orderedIds.indexOf(anchorId) : -1;
  if (ai < 0) return selectOnly(targetId);
  const lo = Math.min(ai, ti);
  const hi = Math.max(ai, ti);
  const slice = orderedIds.slice(lo, hi + 1);
  const rest = slice.filter((id) => id !== targetId);
  return [...rest, targetId];
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 与框选矩形相交的 id（保持 items 原序） */
export function marqueeHitTest(
  items: ReadonlyArray<{ id: string; x: number; y: number; w: number; h: number }>,
  marquee: Rect,
): string[] {
  const m = normalizeRect(marquee);
  return items.filter((it) => rectsIntersect(m, { x: it.x, y: it.y, w: it.w, h: it.h })).map((it) => it.id);
}

export function normalizeRect(r: Rect): Rect {
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;
  const x = Math.min(r.x, x2);
  const y = Math.min(r.y, y2);
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}

/** 框选结果：无修饰=替换；Ctrl/Cmd=并入（末项为框选序列末项） */
export function applyMarqueeSelection(
  selectedIds: readonly string[],
  hitIds: readonly string[],
  additive: boolean,
): string[] {
  if (!additive) return [...hitIds];
  const set = new Set(selectedIds);
  const next = [...selectedIds];
  for (const id of hitIds) {
    if (!set.has(id)) {
      set.add(id);
      next.push(id);
    }
  }
  return next;
}

export function translateMany<T extends { x: number; y: number }>(
  els: T[],
  dx: number,
  dy: number,
): T[] {
  return els.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }));
}

export function countTypesById<T extends { id: string; type?: string }>(
  els: readonly T[],
  selectedIds: readonly string[],
): Record<string, number> {
  const set = new Set(selectedIds);
  const out: Record<string, number> = {};
  for (const el of els) {
    if (!set.has(el.id)) continue;
    const t = el.type || "unknown";
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}
