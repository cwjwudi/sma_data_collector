/** 统一管理版式数据源：优先 API，失败则用浏览器 localStorage（rptp 遗留）。 */

import * as api from "@/api/layoutPresets";
import {
  hydrateLayoutPreset,
  loadLayoutPresets as loadLocal,
  saveLayoutPresets,
  type LayoutPreset,
} from "@/lib/report-template/layout-model";

let mem: LayoutPreset[] | null = null;
let offline = false;

export function isLayoutsOffline(): boolean {
  return offline;
}

export function clearLayoutCache(): void {
  mem = null;
}

export async function refreshLayoutPresets(): Promise<LayoutPreset[]> {
  try {
    const full = await api.listLayoutPresetsFull();
    mem = full.map((x) => hydrateLayoutPreset(x as Partial<LayoutPreset>));
    offline = false;
    return mem;
  } catch {
    offline = true;
    mem = loadLocal().map((x) => hydrateLayoutPreset(x));
    return mem;
  }
}

export function layoutPresetsSnapshot(): LayoutPreset[] {
  if (mem) return mem;
  return loadLocal().map((x) => hydrateLayoutPreset(x));
}

export function getLayoutPresetByIdCached(id: string): LayoutPreset | undefined {
  return layoutPresetsSnapshot().find((x) => x.id === id);
}

export function mirrorLocalFromMem(): void {
  if (mem) saveLayoutPresets(mem);
}

export async function saveLayoutPresetRemote(preset: LayoutPreset): Promise<void> {
  await api.putLayoutPreset(preset.id, preset);
  await refreshLayoutPresets();
}

/** 保存单条版式：在线则 PUT 并刷新缓存；失败则写入 localStorage（迁移/离线）。 */
export async function saveLayoutPresetFlexible(preset: LayoutPreset): Promise<void> {
  const p = hydrateLayoutPreset({
    ...preset,
    updatedAt: preset.updatedAt || new Date().toISOString(),
  });
  try {
    await api.putLayoutPreset(p.id, p);
    await refreshLayoutPresets();
  } catch {
    offline = true;
    const snap = layoutPresetsSnapshot().filter((x) => x.id !== p.id);
    snap.push(p);
    mem = snap;
    saveLayoutPresets(snap);
  }
}

export async function deleteLayoutPresetFlexible(id: string): Promise<void> {
  try {
    await api.deleteLayoutPreset(id);
    await refreshLayoutPresets();
  } catch {
    offline = true;
    const snap = layoutPresetsSnapshot().filter((x) => x.id !== id);
    mem = snap;
    saveLayoutPresets(snap);
  }
}
