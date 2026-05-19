/** 版式管理页各分类内的排列顺序（本机 localStorage） */

import type { LayoutPageRole, LayoutPreset } from "@/lib/report-template/layout-model";

import {
  applyDisplayOrder,
  reorderIdsBefore,
} from "@/lib/template-display-order";

const LS_KEY = "sd-sma-report-editor.layout-display-order";

const ROLE_ORDER: LayoutPageRole[] = ["cover", "normal", "back"];

export type LayoutDisplayOrderMap = Partial<Record<LayoutPageRole, string[]>>;

export function loadLayoutDisplayOrder(): LayoutDisplayOrderMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const o = parsed as Record<string, unknown>;
    const out: LayoutDisplayOrderMap = {};
    for (const role of ROLE_ORDER) {
      const v = o[role];
      if (Array.isArray(v)) {
        out[role] = v.filter((x): x is string => typeof x === "string" && x.length > 0);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLayoutDisplayOrderMap(map: LayoutDisplayOrderMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function saveLayoutDisplayOrderForRole(role: LayoutPageRole, ids: string[]): void {
  const map = loadLayoutDisplayOrder();
  map[role] = ids;
  saveLayoutDisplayOrderMap(map);
}

/** 按封面 / 正文 / 末页各自保存的顺序重排整表 */
export function applyLayoutPresetDisplayOrders(presets: LayoutPreset[]): LayoutPreset[] {
  const orderMap = loadLayoutDisplayOrder();
  const out: LayoutPreset[] = [];
  for (const role of ROLE_ORDER) {
    const group = presets.filter((p) => p.pageRole === role);
    const order = orderMap[role] ?? [];
    out.push(...applyDisplayOrder(group, order));
  }
  return out;
}

export function reorderLayoutPresetInRole(
  presets: LayoutPreset[],
  role: LayoutPageRole,
  fromId: string,
  toId: string,
): LayoutPreset[] {
  const group = presets.filter((p) => p.pageRole === role);
  const ids = group.map((p) => p.id);
  const next = reorderIdsBefore(ids, fromId, toId);
  if (next.join() === ids.join()) return presets;
  const map = loadLayoutDisplayOrder();
  map[role] = next;
  saveLayoutDisplayOrderMap(map);
  return applyLayoutPresetDisplayOrders(presets);
}

/** 将 newId 插入到 afterId 之后（同分类内） */
export function insertLayoutPresetAfter(
  presets: LayoutPreset[],
  role: LayoutPageRole,
  newId: string,
  afterId: string,
): LayoutPreset[] {
  const group = presets.filter((p) => p.pageRole === role);
  const without = group.map((p) => p.id).filter((id) => id !== newId);
  const ix = without.indexOf(afterId);
  const next =
    ix >= 0
      ? [...without.slice(0, ix + 1), newId, ...without.slice(ix + 1)]
      : [...without, newId];
  const map = loadLayoutDisplayOrder();
  map[role] = next;
  saveLayoutDisplayOrderMap(map);
  return applyLayoutPresetDisplayOrders(presets);
}

export function pruneLayoutDisplayOrder(presetId: string, role: LayoutPageRole): void {
  const map = loadLayoutDisplayOrder();
  const cur = map[role];
  if (!cur?.length) return;
  map[role] = cur.filter((id) => id !== presetId);
  saveLayoutDisplayOrderMap(map);
}

/** 某用途版式按本机保存的序号排序 */
export function layoutPresetsForRoleOrdered(
  presets: LayoutPreset[],
  role: LayoutPageRole,
): LayoutPreset[] {
  const group = presets.filter((p) => p.pageRole === role);
  const orderMap = loadLayoutDisplayOrder();
  return applyDisplayOrder(group, orderMap[role] ?? []);
}

export type LayoutPresetSelectRow = { preset: LayoutPreset; seq: number };

export function layoutPresetSelectRows(
  presets: LayoutPreset[],
  role: LayoutPageRole,
): LayoutPresetSelectRow[] {
  return layoutPresetsForRoleOrdered(presets, role).map((preset, i) => ({
    preset,
    seq: i + 1,
  }));
}

/** 下拉选项文案：序号 + 名称 */
export function layoutPresetSelectLabel(seq: number, name: string): string {
  return `${seq}. ${name}`;
}
