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

type TemplateClip = { kind: "template"; payload: TemplateElement };
type LayoutClip = { kind: "layout"; payload: LayoutZoneElement; zone: LayoutCanvasZone };

let clip: TemplateClip | LayoutClip | null = null;

export function clearEditorElementClipboard(): void {
  clip = null;
}

export function hasTemplateElementClipboard(): boolean {
  return clip?.kind === "template";
}

export function hasLayoutElementClipboard(): boolean {
  return clip?.kind === "layout";
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

export function copyLayoutZoneElementToClipboard(el: LayoutZoneElement, zone: LayoutCanvasZone): void {
  const raw = JSON.parse(JSON.stringify(el)) as LayoutZoneElement;
  clip = { kind: "layout", payload: raw, zone };
}

/**
 * 从剪贴板生成可贴入的模版控件（新 id + 偏移）；无模版剪贴板时返回 null。
 */
export function takeTemplateElementPasteClone(
  contentW: number,
  contentH: number,
): TemplateElement | null {
  if (clip?.kind !== "template") return null;
  const el = cloneTemplateElementForPaste(clip.payload);
  clampElementToLayout(el, contentW, contentH);
  // 连续粘贴：更新剪贴板坐标，下次再偏移
  clip = { kind: "template", payload: JSON.parse(JSON.stringify(el)) as TemplateElement };
  return el;
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
  if (clip?.kind !== "layout") return null;
  const zone = preferredZone || clip.zone || "body";
  const el = cloneLayoutZoneElementForPaste(clip.payload);
  const { w, h } = bandDimsForZone(preset, zone);
  clampZoneElement(el, w, h);
  elementsForZone(preset, zone).push(el);
  clip = { kind: "layout", payload: JSON.parse(JSON.stringify(el)) as LayoutZoneElement, zone };
  return el.id;
}

/** 输入框 / 下拉内不拦截系统剪贴板与撤销快捷键 */
export function eventTargetIsTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
