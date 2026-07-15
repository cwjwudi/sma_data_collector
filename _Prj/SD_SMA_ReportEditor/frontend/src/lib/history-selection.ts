/**
 * 历史报表多选辅助（022 · Q10）
 */

/** 根据上次锚点与 Shift 区间，计算新选中 key 集合 */
export function applySelectionClick(opts: {
  key: string;
  orderedKeys: string[];
  selected: Set<string>;
  anchorKey: string | null;
  additive: boolean;
  range: boolean;
}): { selected: Set<string>; anchorKey: string } {
  const { key, orderedKeys, additive, range } = opts;
  const selected = new Set(opts.selected);
  let anchorKey = opts.anchorKey;

  if (range && anchorKey && orderedKeys.includes(anchorKey) && orderedKeys.includes(key)) {
    const a = orderedKeys.indexOf(anchorKey);
    const b = orderedKeys.indexOf(key);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (!additive) selected.clear();
    for (let i = lo; i <= hi; i++) selected.add(orderedKeys[i]!);
    return { selected, anchorKey };
  }

  if (additive) {
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    return { selected, anchorKey: key };
  }

  selected.clear();
  selected.add(key);
  return { selected, anchorKey: key };
}

export function entryPathOf(e: {
  kind: "dir" | "pdf";
  path?: string;
  filePath?: string;
}): string {
  return e.kind === "dir" ? String(e.path || "") : String(e.filePath || "");
}

export function summarizeTransferResult(res: {
  copied?: number;
  moved?: number;
  skipped?: number;
  failed?: number;
  results?: Array<{ status: string; error?: string; source?: string }>;
}): string {
  const parts = [
    `复制 ${res.copied ?? 0}`,
    `移动 ${res.moved ?? 0}`,
    `跳过 ${res.skipped ?? 0}`,
    `失败 ${res.failed ?? 0}`,
  ];
  const fails = (res.results || []).filter((r) => r.status === "failed").slice(0, 3);
  if (fails.length) {
    parts.push(
      "详情：" +
        fails.map((f) => `${f.source || "?"}（${f.error || "未知"}）`).join("；"),
    );
  }
  return parts.join(" · ");
}
