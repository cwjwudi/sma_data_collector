/** 模版编辑器：按控件 id 在画布 / 页眉页脚 / 装饰层查找（健康 focus 与选中模型） */

import type { LayoutZoneElement } from "./layout-zone-element";
import type { ReportTemplate, TemplateElement } from "./model";
import { ensureBodyPages } from "./model";
import { bodyElementsRef, type EditorSheet } from "./editor-sheet";
import { zoneBodyDecorRef } from "./editor-sheet";

export type TemplateZoneBand = "header" | "footer" | "bodyDecor";

export type TemplateSelectionHit =
  | {
      kind: "canvas";
      sheet: EditorSheet;
      bodyPageIndex: number | null;
      element: TemplateElement;
    }
  | {
      kind: "zone";
      sheet: EditorSheet;
      zone: TemplateZoneBand;
      element: LayoutZoneElement;
    };

function findInList<T extends { id: string }>(list: T[] | null | undefined, id: string): T | null {
  if (!Array.isArray(list)) return null;
  return list.find((x) => x.id === id) ?? null;
}

function headerEls(t: ReportTemplate, sheet: EditorSheet): LayoutZoneElement[] {
  if (sheet === "cover") return t.coverHeaderElements ?? [];
  if (sheet === "back") return t.backHeaderElements ?? [];
  return t.headerElements ?? [];
}

function footerEls(t: ReportTemplate, sheet: EditorSheet): LayoutZoneElement[] {
  if (sheet === "cover") return t.coverFooterElements ?? [];
  if (sheet === "back") return t.backFooterElements ?? [];
  return t.footerElements ?? [];
}

/** 在模版各层按 id 查找可选中控件；找不到返回 null */
export function findSelectableTemplateElement(
  t: ReportTemplate | null | undefined,
  id: string | null | undefined,
): TemplateSelectionHit | null {
  if (!t || !id) return null;
  const want = String(id).trim();
  if (!want) return null;

  const pages = ensureBodyPages(t);
  for (let i = 0; i < pages.length; i++) {
    const el = findInList(pages[i], want);
    if (el) {
      return { kind: "canvas", sheet: "body", bodyPageIndex: i, element: el };
    }
  }

  for (const sheet of ["cover", "back"] as const) {
    const el = findInList(bodyElementsRef(t, sheet), want);
    if (el) {
      return { kind: "canvas", sheet, bodyPageIndex: null, element: el };
    }
  }

  for (const sheet of ["body", "cover", "back"] as const) {
    const h = findInList(headerEls(t, sheet), want);
    if (h) return { kind: "zone", sheet, zone: "header", element: h };
    const f = findInList(footerEls(t, sheet), want);
    if (f) return { kind: "zone", sheet, zone: "footer", element: f };
    const d = findInList(zoneBodyDecorRef(t, sheet), want);
    if (d) return { kind: "zone", sheet, zone: "bodyDecor", element: d };
  }

  return null;
}

export function selectionHitLabel(hit: TemplateSelectionHit): string {
  if (hit.kind === "canvas") {
    if (hit.sheet === "body") {
      const n = (hit.bodyPageIndex ?? 0) + 1;
      return `正文第${n}页`;
    }
    return hit.sheet === "cover" ? "封面画布" : "末页画布";
  }
  const sheetLab = hit.sheet === "cover" ? "封面" : hit.sheet === "back" ? "末页" : "正文";
  const zoneLab =
    hit.zone === "header" ? "页眉" : hit.zone === "footer" ? "页脚" : "版式装饰层";
  return `${sheetLab}${zoneLab}`;
}
