import { loadLayoutPresets } from "./layout-model";
import type { LayoutPreset } from "./layout-model";

export function getLayoutPresetById(id: string): LayoutPreset | undefined {
  return loadLayoutPresets().find((x) => x.id === id);
}
