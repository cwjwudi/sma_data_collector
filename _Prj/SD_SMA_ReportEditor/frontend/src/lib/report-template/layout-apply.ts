import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { hydrateLayoutPreset, presetZonesSnapshot } from "@/lib/report-template/layout-model";
import type { ReportTemplate } from "@/lib/report-template/model";

export type LayoutPresetSlot = "body" | "cover" | "back";

/** 将单项版式合并进模版对应槽位（与新建向导语义一致）。 */
export function applyLayoutPresetToTemplate(
  tmpl: ReportTemplate,
  preset: LayoutPreset,
  slot: LayoutPresetSlot,
): void {
  const z = presetZonesSnapshot(hydrateLayoutPreset(preset));
  if (slot === "body") {
    tmpl.layoutPresetId = preset.id;
    tmpl.layoutSnapshot = { ...z.layoutSnapshot };
    tmpl.headerText = z.headerText;
    tmpl.footerText = z.footerText;
    tmpl.headerElements = z.headerElements.map((e) => ({ ...e }));
    tmpl.footerElements = z.footerElements.map((e) => ({ ...e }));
    return;
  }
  if (slot === "cover") {
    tmpl.coverLayoutPresetId = preset.id;
    tmpl.coverLayoutSnapshot = { ...z.layoutSnapshot };
    tmpl.coverHeaderText = z.headerText;
    tmpl.coverFooterText = z.footerText;
    tmpl.coverHeaderElements = z.headerElements.map((e) => ({ ...e }));
    tmpl.coverFooterElements = z.footerElements.map((e) => ({ ...e }));
    tmpl.coverBodyZoneElements = z.bodyElements.map((e) => ({ ...e }));
    return;
  }
  tmpl.backLayoutPresetId = preset.id;
  tmpl.backLayoutSnapshot = { ...z.layoutSnapshot };
  tmpl.backHeaderText = z.headerText;
  tmpl.backFooterText = z.footerText;
  tmpl.backHeaderElements = z.headerElements.map((e) => ({ ...e }));
  tmpl.backFooterElements = z.footerElements.map((e) => ({ ...e }));
  tmpl.backBodyZoneElements = z.bodyElements.map((e) => ({ ...e }));
}

/**
 * 模版在各槽位记录的 `*LayoutPresetId` 仅表示「曾套用哪条版式」；纸上内容来自嵌入快照。
 * 版式库更新后，用当前 presets 列表中的同名 ID 再套用一遍，使画布/缩略图与最新版式一致。
 * （未绑定 ID 的槽位不变；版式已删除则跳过该槽位。）
 */
export function resyncTemplateBoundPresets(tmpl: ReportTemplate, presets: LayoutPreset[]): boolean {
  let touched = false;
  const bodyId = tmpl.layoutPresetId;
  if (bodyId) {
    const p = presets.find((x) => x.id === bodyId && x.pageRole === "normal");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "body");
      touched = true;
    }
  }
  const covId = tmpl.coverLayoutPresetId;
  if (covId) {
    const p = presets.find((x) => x.id === covId && x.pageRole === "cover");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "cover");
      touched = true;
    }
  }
  const backId = tmpl.backLayoutPresetId;
  if (backId) {
    const p = presets.find((x) => x.id === backId && x.pageRole === "back");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "back");
      touched = true;
    }
  }
  return touched;
}
