/**
 * 从模版画布与页眉页脚区收集显式 fontFamily（空 = 画布默认，不计入）。
 */
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import {
  forEachTemplateCanvasElement,
  forEachZoneLayoutElement,
} from "@/lib/report-template/binding-preview-utils";

function pushFamily(set: Set<string>, raw: unknown) {
  if (typeof raw !== "string") return;
  const s = raw.trim();
  if (!s) return;
  // CSS 可能写 "Microsoft YaHei", sans-serif — 取第一族
  const first = s.split(",")[0]?.trim().replace(/^["']|["']$/g, "") || "";
  if (first) set.add(first);
}

export function collectFontFamiliesFromLayoutElements(
  elements: Iterable<LayoutZoneElement | TemplateElement>,
): string[] {
  const set = new Set<string>();
  for (const el of elements) {
    pushFamily(set, (el as { fontFamily?: string }).fontFamily);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}

export function collectFontFamiliesFromTemplate(tmpl: ReportTemplate): string[] {
  const set = new Set<string>();
  forEachTemplateCanvasElement(tmpl, (el) => pushFamily(set, el.fontFamily));
  forEachZoneLayoutElement(tmpl, (el) => pushFamily(set, el.fontFamily));
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
