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
