/** 模版各逻辑页快照指纹（列表缩略图上标记「相对上次保存有改动」时使用） */

import type { ReportTemplate } from "./model";
import type { TemplateElement } from "./model";
import { clampTableElementOuterSize, ensureBodyPages } from "./model";
function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

export function stableFingerprintPart(v: unknown): string {
  return JSON.stringify(sortKeysDeep(v));
}

export interface TemplateFingerprints {
  body: string;
  cover: string;
  back: string;
}

export function computeFingerprints(t: ReportTemplate): TemplateFingerprints {
  const bodyPack = {
    paperKind: t.paperKind,
    orientation: t.orientation,
    layoutPresetId: t.layoutPresetId,
    layoutSnapshot: t.layoutSnapshot,
    headerText: t.headerText,
    footerText: t.footerText,
    headerElements: t.headerElements,
    footerElements: t.footerElements,
    bodyPages: ensureBodyPages(t),
  };
  const coverPack = {
    coverLayoutPresetId: t.coverLayoutPresetId,
    coverLayoutSnapshot: t.coverLayoutSnapshot,
    coverHeaderText: t.coverHeaderText,
    coverFooterText: t.coverFooterText,
    coverHeaderElements: t.coverHeaderElements,
    coverFooterElements: t.coverFooterElements,
    coverBodyZoneElements: t.coverBodyZoneElements,
    coverElements: t.coverElements,
  };
  const backPack = {
    backLayoutPresetId: t.backLayoutPresetId,
    backLayoutSnapshot: t.backLayoutSnapshot,
    backHeaderText: t.backHeaderText,
    backFooterText: t.backFooterText,
    backHeaderElements: t.backHeaderElements,
    backFooterElements: t.backFooterElements,
    backBodyZoneElements: t.backBodyZoneElements,
    backElements: t.backElements,
  };
  return {
    body: stableFingerprintPart(bodyPack),
    cover: stableFingerprintPart(coverPack),
    back: stableFingerprintPart(backPack),
  };
}

export function cloneDeepTemplate(t: ReportTemplate): ReportTemplate {
  const json = JSON.stringify(t);
  return JSON.parse(json) as ReportTemplate;
}

export function clampElementToLayout(
  el: TemplateElement,
  contentW: number,
  contentH: number,
): void {
  el.w = Math.max(20, Math.min(el.w, contentW));
  el.h = Math.max(20, Math.min(el.h, contentH));
  el.x = Math.max(0, Math.min(el.x, contentW - el.w));
  el.y = Math.max(0, Math.min(el.y, contentH - el.h));
  // 表格贴合高度不得超过「从控件顶边到正文底」的剩余空间（勿用整页 contentH）
  clampTableElementOuterSize(el, contentW, Math.max(20, contentH - el.y));
  el.w = Math.max(20, Math.min(el.w, contentW));
  el.h = Math.max(20, Math.min(el.h, contentH - el.y));
  el.x = Math.max(0, Math.min(el.x, contentW - el.w));
  el.y = Math.max(0, Math.min(el.y, contentH - el.h));
}
/** 按给定正文区尺寸收紧所有正文分页控件（封面/末页请另用对应 metrics） */
export function clampAllElementsForPaper(
  t: ReportTemplate,
  metrics: import("./layout-geometry").PaperLayoutMetrics,
): void {
  const { contentW, contentH } = metrics;
  for (const row of ensureBodyPages(t)) {
    row.forEach((el) => clampElementToLayout(el, contentW, contentH));
  }
}
