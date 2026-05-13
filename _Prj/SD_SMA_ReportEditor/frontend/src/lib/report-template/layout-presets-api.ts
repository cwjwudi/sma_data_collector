import type { LayoutPreset } from "./layout-model";
import { getLayoutPresetByIdCached } from "./layout-registry";

/** 与模版向导/编辑器统一：来自已拉取的 API 缓存或 localStorage 兜底。 */
export function getLayoutPresetById(id: string): LayoutPreset | undefined {
  return getLayoutPresetByIdCached(id);
}
