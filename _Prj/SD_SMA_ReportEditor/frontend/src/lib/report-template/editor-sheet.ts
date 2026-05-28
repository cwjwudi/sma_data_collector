import type { ReportTemplate } from "./model";
import { ensureBodyPages } from "./model";
import type { LayoutSnapshot } from "./layout-model";
import type { PaperLayoutMetrics } from "./layout-geometry";
import { computePaperLayout } from "./layout-geometry";
import type { TemplateElement } from "./model";

export type EditorSheet = "body" | "cover" | "back";

export function activeLayoutSnapshotForSheet(
  t: ReportTemplate,
  sheet: EditorSheet,
): LayoutSnapshot {
  if (sheet === "cover") return { ...t.coverLayoutSnapshot };
  if (sheet === "back") return { ...t.backLayoutSnapshot };
  return { ...t.layoutSnapshot };
}

export function metricsForSheet(
  t: ReportTemplate,
  sheet: EditorSheet,
): PaperLayoutMetrics {
  const snap = activeLayoutSnapshotForSheet(t, sheet);
  return computePaperLayout(t.paperKind, t.orientation, snap);
}

export function bodyElementsRef(
  t: ReportTemplate,
  sheet: EditorSheet,
  bodyPageIndex = 0,
): TemplateElement[] {
  if (sheet === "cover") return t.coverElements;
  if (sheet === "back") return t.backElements;
  const pages = ensureBodyPages(t);
  const idx = Math.max(0, Math.min(bodyPageIndex | 0, pages.length - 1));
  return pages[idx];
}

export function zoneBodyDecorRef(t: ReportTemplate, sheet: EditorSheet) {
  if (sheet === "cover") return t.coverBodyZoneElements;
  if (sheet === "back") return t.backBodyZoneElements;
  return [] as ReportTemplate["coverBodyZoneElements"];
}

function hasBoundLayoutPresetId(presetId: string | null | undefined): boolean {
  return String(presetId ?? "").trim().length > 0;
}

function sheetHasUserContent(
  presetId: string | null,
  elements: TemplateElement[],
  headerEls: ReportTemplate["coverHeaderElements"],
  footerEls: ReportTemplate["coverFooterElements"],
  bodyZoneEls: ReportTemplate["coverBodyZoneElements"],
  headerText: string,
  footerText: string,
): boolean {
  if (hasBoundLayoutPresetId(presetId)) return true;
  if (elements.length > 0) return true;
  if (headerEls.length > 0 || footerEls.length > 0) return true;
  if (bodyZoneEls.length > 0) return true;
  if (String(headerText ?? "").trim()) return true;
  if (String(footerText ?? "").trim()) return true;
  return false;
}

/** 新建向导选「不使用封面」且未再绑版式/加控件时为 false */
export function templateHasCoverSheet(t: ReportTemplate): boolean {
  return sheetHasUserContent(
    t.coverLayoutPresetId,
    t.coverElements ?? [],
    t.coverHeaderElements ?? [],
    t.coverFooterElements ?? [],
    t.coverBodyZoneElements ?? [],
    t.coverHeaderText ?? "",
    t.coverFooterText ?? "",
  );
}

/** 新建向导选「不使用末页」且未再绑版式/加控件时为 false */
export function templateHasBackSheet(t: ReportTemplate): boolean {
  return sheetHasUserContent(
    t.backLayoutPresetId,
    t.backElements ?? [],
    t.backHeaderElements ?? [],
    t.backFooterElements ?? [],
    t.backBodyZoneElements ?? [],
    t.backHeaderText ?? "",
    t.backFooterText ?? "",
  );
}

export function templateExportPageCount(
  t: ReportTemplate,
  expandedBodyCardCount: number,
): number {
  let n = expandedBodyCardCount;
  if (templateHasCoverSheet(t)) n += 1;
  if (templateHasBackSheet(t)) n += 1;
  return n;
}
