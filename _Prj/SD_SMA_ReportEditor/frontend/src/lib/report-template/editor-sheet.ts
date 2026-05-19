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
