/** 统一管理版式数据源：优先 API，失败则用浏览器 localStorage（rptp 遗留）。 */

import * as api from "@/api/layoutPresets";
import {
  hydrateLayoutPreset,
  loadLayoutPresets as loadLocal,
  saveLayoutPresets,
  type LayoutPreset,
} from "@/lib/report-template/layout-model";

let mem: LayoutPreset[] | null = null;
let memSummaries: LayoutPreset[] | null = null;
let offline = false;

export function isLayoutsOffline(): boolean {
  return offline;
}

export function clearLayoutCache(): void {
  mem = null;
  memSummaries = null;
}

/** 列表页专用：仅拉摘要（不解析页眉页脚大数组），显著快于 /full */
export async function ensureLayoutPresetSummariesLoaded(): Promise<LayoutPreset[]> {
  if (memSummaries && !offline) return memSummaries;
  if (mem && !offline) return mem;
  try {
    const summaries = await api.listLayoutPresetSummaries();
    memSummaries = (summaries as Partial<LayoutPreset>[]).map((x) => hydrateLayoutPreset(x));
    offline = false;
    return memSummaries;
  } catch {
    offline = true;
    const local = loadLocal().map((x) => hydrateLayoutPreset(x));
    memSummaries = local;
    return local;
  }
}

export async function refreshLayoutPresets(): Promise<LayoutPreset[]> {
  try {
    const full = await api.listLayoutPresetsFull();
    mem = full.map((x) => hydrateLayoutPreset(x as Partial<LayoutPreset>));
    memSummaries = mem;
    offline = false;
    return mem;
  } catch {
    offline = true;
    mem = loadLocal().map((x) => hydrateLayoutPreset(x));
    memSummaries = mem;
    return mem;
  }
}

/**
 * 已在本会话成功加载过**完整**版式库则直接复用内存快照。
 * 仅摘要（memSummaries）不能用于缩略图/编辑器等需要页眉页脚控件的场景。
 */
export async function ensureLayoutPresetsLoaded(): Promise<LayoutPreset[]> {
  if (mem && !offline) return mem;
  return refreshLayoutPresets();
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

export type SaveLayoutPresetResult =
  | { ok: true; source: "remote"; preset: LayoutPreset }
  | { ok: true; source: "local"; preset: LayoutPreset; warning: string }
  | { ok: false; message: string };

/** 保存单条版式：在线则 PUT 并刷新缓存；失败则写入 localStorage（迁移/离线）。 */
export async function saveLayoutPresetFlexible(preset: LayoutPreset): Promise<SaveLayoutPresetResult> {
  const p = hydrateLayoutPreset({
    ...preset,
    updatedAt: preset.updatedAt || new Date().toISOString(),
  });
  try {
    const body = await api.putLayoutPreset(p.id, p);
    const hydrated = hydrateLayoutPreset(body as Partial<LayoutPreset>);
    await refreshLayoutPresets();
    offline = false;
    return { ok: true, source: "remote", preset: hydrated };
  } catch (e) {
    offline = true;
    const reason = e instanceof Error ? e.message : String(e);
    try {
      const snap = layoutPresetsSnapshot().filter((x) => x.id !== p.id);
      snap.push(p);
      mem = snap;
      saveLayoutPresets(snap);
    } catch (persistErr) {
      const detail = persistErr instanceof Error ? persistErr.message : String(persistErr);
      return { ok: false, message: `服务器保存失败（${reason}），且写入浏览器缓存也失败：${detail}` };
    }
    return { ok: true, source: "local", preset: p, warning: reason };
  }
}

export async function deleteLayoutPresetFlexible(id: string): Promise<void> {
  try {
    await api.deleteLayoutPreset(id);
    // 删除后仅从内存快照移除该项，避免重新拉取并解析所有整份版式（含页眉页脚大图）导致卡顿。
    if (mem) {
      mem = mem.filter((x) => x.id !== id);
      mirrorLocalFromMem();
    }
    offline = false;
  } catch {
    offline = true;
    const snap = layoutPresetsSnapshot().filter((x) => x.id !== id);
    mem = snap;
    saveLayoutPresets(snap);
  }
}
