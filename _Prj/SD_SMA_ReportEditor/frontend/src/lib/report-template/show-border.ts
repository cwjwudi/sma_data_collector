/** 预览/导出控件外框（showBorder）相关纯函数。 */

import type { LayoutZoneElement } from "./layout-zone-element";
import type { ReportTemplate, TemplateElement } from "./model";
import { ensureBodyPages } from "./model";
import {
  bodyElementsRef,
  type EditorSheet,
  zoneBodyDecorRef,
} from "./editor-sheet";

export type ShowBorderElementLike = {
  type: string;
  showBorder: boolean;
};

/**
 * 将当前列表中非表格控件的 showBorder 设为 false。
 * @returns 实际修改的个数（已是 false 的不计）
 */
export function hideShowBordersInElements(els: ShowBorderElementLike[]): number {
  let n = 0;
  for (const el of els) {
    if (el.type === "table") continue;
    if (el.showBorder === false) continue;
    el.showBorder = false;
    n += 1;
  }
  return n;
}

/** Mini / Chromium：与 TemplateMiniPage / TemplateBodyCanvas 一致的外框 CSS 判定。 */
export function chromeBorderCss(
  showBorder: boolean | undefined,
  visibleBorderCss: string,
): string {
  return showBorder === false ? "none" : visibleBorderCss;
}

function headerElsMut(t: ReportTemplate, sheet: EditorSheet): LayoutZoneElement[] {
  if (sheet === "cover") return t.coverHeaderElements;
  if (sheet === "back") return t.backHeaderElements;
  return t.headerElements;
}

function footerElsMut(t: ReportTemplate, sheet: EditorSheet): LayoutZoneElement[] {
  if (sheet === "cover") return t.coverFooterElements;
  if (sheet === "back") return t.backFooterElements;
  return t.footerElements;
}

/**
 * 单 sheet「一键隐藏边框」（细粒度 / 测试用）：页眉 + 页脚 + 正文（指定正文页）+ zone 装饰。
 * 模版编辑器工具栏请用 {@link hideBordersOnEntireTemplate}。
 */
export function hideBordersOnTemplateSheet(
  t: ReportTemplate,
  sheet: EditorSheet,
  bodyPageIndex = 0,
): number {
  let n = 0;
  n += hideShowBordersInElements(headerElsMut(t, sheet));
  n += hideShowBordersInElements(footerElsMut(t, sheet));
  n += hideShowBordersInElements(bodyElementsRef(t, sheet, bodyPageIndex));
  n += hideShowBordersInElements(zoneBodyDecorRef(t, sheet) as ShowBorderElementLike[]);
  return n;
}

/**
 * 模版编辑器「一键隐藏边框」：整份模版（封面 + 正文全部页 + 封底）的页眉/页脚/正文/zone 装饰。
 * 表格控件仍跳过。不依赖当前选中 sheet/页。
 */
export function hideBordersOnEntireTemplate(t: ReportTemplate): number {
  let n = 0;
  const sheets: EditorSheet[] = ["cover", "body", "back"];
  for (const sheet of sheets) {
    n += hideShowBordersInElements(headerElsMut(t, sheet));
    n += hideShowBordersInElements(footerElsMut(t, sheet));
    n += hideShowBordersInElements(zoneBodyDecorRef(t, sheet) as ShowBorderElementLike[]);
    if (sheet === "body") {
      const pages = ensureBodyPages(t);
      for (const page of pages) {
        n += hideShowBordersInElements(page);
      }
    } else {
      n += hideShowBordersInElements(bodyElementsRef(t, sheet, 0));
    }
  }
  return n;
}

/** 版式库「一键隐藏边框」：页眉 + 正文 + 页脚。 */
export function hideBordersOnLayoutPresetBands(bands: {
  headerElements: ShowBorderElementLike[];
  bodyElements: ShowBorderElementLike[];
  footerElements: ShowBorderElementLike[];
}): number {
  let n = 0;
  n += hideShowBordersInElements(bands.headerElements);
  n += hideShowBordersInElements(bands.bodyElements);
  n += hideShowBordersInElements(bands.footerElements);
  return n;
}

/** 测试/诊断：汇总某 sheet 各带 showBorder（表格单独标出）。 */
export function sheetShowBorderSnapshot(
  t: ReportTemplate,
  sheet: EditorSheet,
  bodyPageIndex = 0,
): {
  header: Array<{ id: string; type: string; showBorder: boolean }>;
  footer: Array<{ id: string; type: string; showBorder: boolean }>;
  body: Array<{ id: string; type: string; showBorder: boolean }>;
  bodyDecor: Array<{ id: string; type: string; showBorder: boolean }>;
} {
  const snap = (els: Array<{ id: string; type: string; showBorder: boolean }>) =>
    els.map((e) => ({ id: e.id, type: e.type, showBorder: e.showBorder }));
  return {
    header: snap(headerElsMut(t, sheet)),
    footer: snap(footerElsMut(t, sheet)),
    body: snap(bodyElementsRef(t, sheet, bodyPageIndex) as TemplateElement[]),
    bodyDecor: snap(zoneBodyDecorRef(t, sheet)),
  };
}
