/**
 * 模版 / 版式画布：控件级复制粘贴（深拷贝全部属性，粘贴时分配新 id 并偏移位置）。
 */

import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { presetToSnapshot } from "@/lib/report-template/layout-model";
import {
  clampZoneElement,
  hydrateLayoutZoneElement,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import type { TemplateElement } from "@/lib/report-template/model";
import { hydrateTemplateElement } from "@/lib/report-template/model";
import { clampElementToLayout } from "@/lib/report-template/snapshot-fingerprint";

export const EDITOR_ELEMENT_PASTE_OFFSET_PX = 16;

export type LayoutCanvasZone = "header" | "body" | "footer";

type TemplateClip =
  | { kind: "template"; payload: TemplateElement }
  | { kind: "template_multi"; payloads: TemplateElement[] };
type LayoutClip =
  | { kind: "layout"; payload: LayoutZoneElement; zone: LayoutCanvasZone }
  | {
      kind: "layout_multi";
      items: Array<{ payload: LayoutZoneElement; zone: LayoutCanvasZone }>;
    };

let clip: TemplateClip | LayoutClip | null = null;

export function clearEditorElementClipboard(): void {
  clip = null;
}

export function hasTemplateElementClipboard(): boolean {
  return clip?.kind === "template" || clip?.kind === "template_multi";
}

export function hasLayoutElementClipboard(): boolean {
  return clip?.kind === "layout" || clip?.kind === "layout_multi";
}

/** 深拷贝控件全部字段；去掉 id，由 hydrate 分配新 id */
export function cloneTemplateElementForPaste(
  src: TemplateElement,
  offsetPx = EDITOR_ELEMENT_PASTE_OFFSET_PX,
): TemplateElement {
  const raw = JSON.parse(JSON.stringify(src)) as Partial<TemplateElement>;
  delete raw.id;
  const el = hydrateTemplateElement(raw);
  el.x = Math.max(0, (Number(src.x) || 0) + offsetPx);
  el.y = Math.max(0, (Number(src.y) || 0) + offsetPx);
  return el;
}

export function cloneLayoutZoneElementForPaste(
  src: LayoutZoneElement,
  offsetPx = EDITOR_ELEMENT_PASTE_OFFSET_PX,
): LayoutZoneElement {
  const raw = JSON.parse(JSON.stringify(src)) as Partial<LayoutZoneElement>;
  delete raw.id;
  const el = hydrateLayoutZoneElement(raw);
  el.x = Math.max(0, (Number(src.x) || 0) + offsetPx);
  el.y = Math.max(0, (Number(src.y) || 0) + offsetPx);
  return el;
}

export function copyTemplateElementToClipboard(el: TemplateElement): void {
  const raw = JSON.parse(JSON.stringify(el)) as TemplateElement;
  clip = { kind: "template", payload: raw };
}

/** 多选复制 */
export function copyTemplateElementsToClipboard(els: TemplateElement[]): void {
  if (!els.length) return;
  if (els.length === 1) {
    copyTemplateElementToClipboard(els[0]!);
    return;
  }
  clip = {
    kind: "template_multi",
    payloads: els.map((el) => JSON.parse(JSON.stringify(el)) as TemplateElement),
  };
}

export function copyLayoutZoneElementToClipboard(el: LayoutZoneElement, zone: LayoutCanvasZone): void {
  const raw = JSON.parse(JSON.stringify(el)) as LayoutZoneElement;
  clip = { kind: "layout", payload: raw, zone };
}

export function copyLayoutZoneElementsToClipboard(
  items: Array<{ el: LayoutZoneElement; zone: LayoutCanvasZone }>,
): void {
  if (!items.length) return;
  if (items.length === 1) {
    copyLayoutZoneElementToClipboard(items[0]!.el, items[0]!.zone);
    return;
  }
  clip = {
    kind: "layout_multi",
    items: items.map(({ el, zone }) => ({
      payload: JSON.parse(JSON.stringify(el)) as LayoutZoneElement,
      zone,
    })),
  };
}

/**
 * 从剪贴板生成可贴入的模版控件（新 id + 偏移）；无模版剪贴板时返回 null。
 * 多选剪贴板时只粘贴第一个（兼容旧调用方）；请优先用 takeTemplateElementsPasteClones。
 */
export function takeTemplateElementPasteClone(
  contentW: number,
  contentH: number,
): TemplateElement | null {
  const many = takeTemplateElementsPasteClones(contentW, contentH);
  return many[0] ?? null;
}

/** 粘贴全部（单/多）；返回新元素列表 */
export function takeTemplateElementsPasteClones(
  contentW: number,
  contentH: number,
): TemplateElement[] {
  if (clip?.kind === "template") {
    const el = cloneTemplateElementForPaste(clip.payload);
    clampElementToLayout(el, contentW, contentH);
    clip = { kind: "template", payload: JSON.parse(JSON.stringify(el)) as TemplateElement };
    return [el];
  }
  if (clip?.kind === "template_multi") {
    const out: TemplateElement[] = [];
    const nextPayloads: TemplateElement[] = [];
    for (const src of clip.payloads) {
      const el = cloneTemplateElementForPaste(src);
      clampElementToLayout(el, contentW, contentH);
      out.push(el);
      nextPayloads.push(JSON.parse(JSON.stringify(el)) as TemplateElement);
    }
    clip = { kind: "template_multi", payloads: nextPayloads };
    return out;
  }
  return [];
}

export function findLayoutElementZone(preset: LayoutPreset, elId: string): LayoutCanvasZone | null {
  if (preset.headerElements.some((x) => x.id === elId)) return "header";
  if (preset.footerElements.some((x) => x.id === elId)) return "footer";
  if (preset.bodyElements.some((x) => x.id === elId)) return "body";
  return null;
}

function bandDimsForZone(
  preset: LayoutPreset,
  zone: LayoutCanvasZone,
): { w: number; h: number } {
  const m = computePaperLayout(preset.paperKind, preset.orientation, presetToSnapshot(preset));
  const bw = Math.max(40, m.pageW - m.ml - m.mr);
  if (zone === "header") return { w: bw, h: Math.max(8, m.hb) };
  if (zone === "footer") return { w: bw, h: Math.max(8, m.fb) };
  return { w: m.contentW, h: m.contentH };
}

function elementsForZone(preset: LayoutPreset, zone: LayoutCanvasZone): LayoutZoneElement[] {
  if (zone === "header") return preset.headerElements;
  if (zone === "footer") return preset.footerElements;
  return preset.bodyElements;
}

/**
 * 粘贴版式控件：优先落到当前选中所在区，否则落到复制时的区，再否则正文区。
 * 返回新元素 id；无剪贴板时返回 null。
 */
export function pasteLayoutZoneElementIntoPreset(
  preset: LayoutPreset,
  preferredZone: LayoutCanvasZone | null,
): string | null {
  const ids = pasteLayoutZoneElementsIntoPreset(preset, preferredZone);
  return ids[0] ?? null;
}

/** 粘贴全部版式控件；返回新 id 列表 */
export function pasteLayoutZoneElementsIntoPreset(
  preset: LayoutPreset,
  preferredZone: LayoutCanvasZone | null,
): string[] {
  if (clip?.kind === "layout") {
    const zone = preferredZone || clip.zone || "body";
    const el = cloneLayoutZoneElementForPaste(clip.payload);
    const { w, h } = bandDimsForZone(preset, zone);
    clampZoneElement(el, w, h);
    elementsForZone(preset, zone).push(el);
    clip = { kind: "layout", payload: JSON.parse(JSON.stringify(el)) as LayoutZoneElement, zone };
    return [el.id];
  }
  if (clip?.kind === "layout_multi") {
    const ids: string[] = [];
    const nextItems: Array<{ payload: LayoutZoneElement; zone: LayoutCanvasZone }> = [];
    for (const item of clip.items) {
      const zone = preferredZone || item.zone || "body";
      const el = cloneLayoutZoneElementForPaste(item.payload);
      const { w, h } = bandDimsForZone(preset, zone);
      clampZoneElement(el, w, h);
      elementsForZone(preset, zone).push(el);
      ids.push(el.id);
      nextItems.push({ payload: JSON.parse(JSON.stringify(el)) as LayoutZoneElement, zone });
    }
    clip = { kind: "layout_multi", items: nextItems };
    return ids;
  }
  return [];
}

/** 输入框 / 下拉内不拦截系统剪贴板与撤销快捷键 */
export function eventTargetIsTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
