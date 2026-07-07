/** 模版管理页缩略图排列顺序（本机 localStorage，与后端模版数据独立） */

const LS_KEY = "sd-sma-report-editor.template-display-order";

export function loadTemplateDisplayOrder(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function saveTemplateDisplayOrder(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

/** 按已保存顺序重排；未出现在 order 中的条目保持在末尾（保持原相对顺序） */
export function applyDisplayOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return [...items];
  const map = new Map(items.map((x) => [x.id, x]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const item = map.get(id);
    if (item) {
      out.push(item);
      seen.add(id);
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) out.push(item);
  }
  return out;
}

export type TemplateSelectRow<T extends { id: string; name: string }> = { item: T; seq: number };

/** 模版下拉：按本机保存顺序并附带序号 */
export function templateSelectRows<T extends { id: string; name: string }>(items: T[]): TemplateSelectRow<T>[] {
  return applyDisplayOrder(items, loadTemplateDisplayOrder()).map((item, i) => ({
    item,
    seq: i + 1,
  }));
}

export function templateSelectLabel(seq: number, name: string): string {
  return `${seq}. ${name}`;
}

/**
 * 将 fromId 拖到 toId 处，按拖拽方向落位（更符合直觉）：
 * - 从前往后拖（from < to）：落到 toId 之后，占据 toId 原来的位置；
 * - 从后往前拖（from > to）：落到 toId 之前，占据 toId 原来的位置。
 * 例如 [1,2,3] 把 1 拖到 2 → [2,1,3]；把 3 拖到 2 → [1,3,2]。
 */
export function reorderIdsBefore(ids: string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = ids.filter((id) => id !== fromId);
  const base = next.indexOf(toId);
  if (base < 0) return ids;
  // 向后拖时插到目标之后，向前拖时插到目标之前
  const insertAt = from < to ? base + 1 : base;
  next.splice(insertAt, 0, fromId);
  return next;
}
