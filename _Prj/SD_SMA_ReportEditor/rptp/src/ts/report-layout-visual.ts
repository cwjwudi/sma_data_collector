import { computePaperLayout, type PaperLayoutMetrics } from "./templates/layout-geometry";
import {
  hydrateLayoutPreset,
  loadLayoutPresets,
  saveLayoutPresets,
  LAYOUT_PAGE_ROLE_LABEL,
  type LayoutPreset,
  type LayoutSnapshot,
} from "./templates/layout-model";
import type { LayoutControlType } from "./templates/layout-zone-element";
import {
  clampZoneElement,
  makeLayoutZoneElement,
  normalizeAlignAxis,
  type LayoutZoneElement,
} from "./templates/layout-zone-element";
import { renderZoneElementsInto } from "./templates/layout-zone-render";
import { PAPER_LABEL, type PaperKind } from "./templates/paper";

export interface LayoutVisualDeps {
  showPage: (id: string) => void;
}

let deps: LayoutVisualDeps;
let draft: LayoutPreset | null = null;

type Sel =
  | { k: "idle" }
  | { k: "global" }
  | { k: "headerBand" }
  | { k: "footerBand" }
  | { k: "el"; zone: "header" | "footer"; ids: string[] };

let sel: Sel = { k: "idle" };

/** 预览缩放（不影响导出几何，仅视图） */
let lvisZoom = 1;

/** 版式可视化页内最近一次指针屏幕坐标（仅在预览区内更新；捏合/wheel 回退用） */
let lvisLastPointerClient = { x: 0, y: 0 };

/** ctrl/meta + wheel：会话内固定锚点，避免触控板连续 wheel 的 client 抖动导致捏偏 */
const LVIS_WHEEL_GESTURE_GAP_MS = 100;
let lvisWheelLastTime = 0;
let lvisWheelGestureAnchor: { x: number; y: number } | null = null;

/** 拖拽对齐网格（px） */
let snapEnabled = true;
let snapGridPx = 8;

let dragMove: {
  zone: "header" | "footer";
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
} | null = null;

let resizeDrag: {
  zone: "header" | "footer";
  id: string;
  handle: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
} | null = null;

/** 版式可视化撤回 / 重做 */
const LVIS_UNDO_CAP = 60;
const LVIS_HISTORY_MERGE_MS = 550;

let lvisUndoStack: LayoutPreset[] = [];
let lvisRedoStack: LayoutPreset[] = [];
let lvisHistoryMergeUntil = 0;

function cloneLayoutDraftFrom(p: LayoutPreset): LayoutPreset {
  const d = hydrateLayoutPreset(JSON.parse(JSON.stringify(p)) as Partial<LayoutPreset>);
  d.headerElements = d.headerElements.map((x) => ({ ...x }));
  d.footerElements = d.footerElements.map((x) => ({ ...x }));
  return d;
}

function syncLvisHistoryButtons(): void {
  const u = document.getElementById("btn-lvis-undo") as HTMLButtonElement | null;
  const r = document.getElementById("btn-lvis-redo") as HTMLButtonElement | null;
  const hasDraft = !!draft;
  if (u) u.disabled = !hasDraft || lvisUndoStack.length === 0;
  if (r) r.disabled = !hasDraft || lvisRedoStack.length === 0;
}

function resetLvisUndoRedo(): void {
  lvisUndoStack = [];
  lvisRedoStack = [];
  lvisHistoryMergeUntil = 0;
  syncLvisHistoryButtons();
}

function coerceSelAfterHistoryJump(): void {
  if (!draft) return;
  if (sel.k !== "el") return;
  const list = sel.zone === "header" ? draft.headerElements : draft.footerElements;
  const ok = sel.ids.filter((id) => list.some((e) => e.id === id));
  if (ok.length === 0) {
    sel = sel.zone === "header" ? { k: "headerBand" } : { k: "footerBand" };
  } else {
    sel = { k: "el", zone: sel.zone, ids: ok };
  }
}

function saveLvisUndoCheckpoint(mode: "merge" | "once"): void {
  if (!draft) return;
  const now = Date.now();
  if (mode === "merge") {
    if (now < lvisHistoryMergeUntil) return;
    lvisHistoryMergeUntil = now + LVIS_HISTORY_MERGE_MS;
  } else {
    lvisHistoryMergeUntil = 0;
  }
  lvisUndoStack.push(cloneLayoutDraftFrom(draft));
  if (lvisUndoStack.length > LVIS_UNDO_CAP) lvisUndoStack.shift();
  lvisRedoStack = [];
  syncLvisHistoryButtons();
}

function undoLvis(): void {
  if (!draft || lvisUndoStack.length === 0) return;
  lvisHistoryMergeUntil = 0;
  lvisRedoStack.push(cloneLayoutDraftFrom(draft));
  if (lvisRedoStack.length > LVIS_UNDO_CAP) lvisRedoStack.shift();
  draft = cloneLayoutDraftFrom(lvisUndoStack.pop()!);
  coerceSelAfterHistoryJump();
  clampAllZoneElements();
  renderLvis();
  syncLvisDrawer();
  syncLvisHistoryButtons();
}

function redoLvis(): void {
  if (!draft || lvisRedoStack.length === 0) return;
  lvisHistoryMergeUntil = 0;
  lvisUndoStack.push(cloneLayoutDraftFrom(draft));
  if (lvisUndoStack.length > LVIS_UNDO_CAP) lvisUndoStack.shift();
  draft = cloneLayoutDraftFrom(lvisRedoStack.pop()!);
  coerceSelAfterHistoryJump();
  clampAllZoneElements();
  renderLvis();
  syncLvisDrawer();
  syncLvisHistoryButtons();
}

function snapPx(v: number): number {
  if (!snapEnabled || snapGridPx <= 0) return Math.round(v);
  return Math.round(v / snapGridPx) * snapGridPx;
}

function snapElInZone(el: LayoutZoneElement, zone: "header" | "footer"): void {
  const { zw, zh } = zoneDims(zone);
  el.x = snapPx(el.x);
  el.y = snapPx(el.y);
  el.w = Math.max(16, snapPx(el.w));
  el.h = Math.max(16, snapPx(el.h));
  clampZoneElement(el, zw, zh);
}

function nudgeStepPx(): number {
  return snapEnabled ? Math.max(1, snapGridPx) : 1;
}

function nudgeSelectedElement(sdx: number, sdy: number): void {
  const el = findSelEl();
  if (!draft || sel.k !== "el" || !el || sel.ids.length !== 1) return;
  saveLvisUndoCheckpoint("merge");
  const z = sel.zone;
  const step = nudgeStepPx();
  el.x = Math.max(0, el.x + sdx * step);
  el.y = Math.max(0, el.y + sdy * step);
  snapElInZone(el, z);
  renderLvis();
  syncElementInputsFromModel();
}

function linearResizeFromHandle(
  handle: string,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number } {
  const MIN = 16;
  let x = ox;
  let y = oy;
  let w = ow;
  let h = oh;
  switch (handle) {
    case "nw":
      x = ox + dx;
      y = oy + dy;
      w = ow - dx;
      h = oh - dy;
      break;
    case "n":
      y = oy + dy;
      h = oh - dy;
      break;
    case "ne":
      y = oy + dy;
      h = oh - dy;
      w = ow + dx;
      break;
    case "e":
      w = ow + dx;
      break;
    case "se":
      w = ow + dx;
      h = oh + dy;
      break;
    case "s":
      h = oh + dy;
      break;
    case "sw":
      x = ox + dx;
      w = ow - dx;
      h = oh + dy;
      break;
    case "w":
      x = ox + dx;
      w = ow - dx;
      break;
    default:
      break;
  }
  if (w < MIN) {
    if (handle === "nw" || handle === "w" || handle === "sw") x = ox + ow - MIN;
    w = MIN;
  }
  if (h < MIN) {
    if (handle === "nw" || handle === "n" || handle === "ne") y = oy + oh - MIN;
    h = MIN;
  }
  return { x, y, w, h };
}

function applyResizeFromHandle(
  el: LayoutZoneElement,
  handle: string,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  dx: number,
  dy: number,
  proportional: boolean,
): void {
  const MIN = 16;
  const r = ow / Math.max(oh, 1e-6);

  let x: number;
  let y: number;
  let w: number;
  let h: number;

  if (!proportional) {
    const o = linearResizeFromHandle(handle, ox, oy, ow, oh, dx, dy);
    x = o.x;
    y = o.y;
    w = o.w;
    h = o.h;
  } else {
    switch (handle) {
      case "se":
        w = Math.max(MIN, ow + dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox;
        y = oy;
        break;
      case "nw":
        w = Math.max(MIN, ow - dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox + ow - w;
        y = oy + oh - h;
        break;
      case "ne":
        w = Math.max(MIN, ow + dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox;
        y = oy + oh - h;
        break;
      case "sw":
        w = Math.max(MIN, ow - dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox + ow - w;
        y = oy;
        break;
      case "e":
        w = Math.max(MIN, ow + dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox;
        y = oy + Math.round((oh - h) / 2);
        break;
      case "w":
        w = Math.max(MIN, ow - dx);
        h = Math.max(MIN, Math.round(w / r));
        x = ox + ow - w;
        y = oy + Math.round((oh - h) / 2);
        break;
      case "s":
        h = Math.max(MIN, oh + dy);
        w = Math.max(MIN, Math.round(h * r));
        x = ox + Math.round((ow - w) / 2);
        y = oy;
        break;
      case "n":
        h = Math.max(MIN, oh - dy);
        w = Math.max(MIN, Math.round(h * r));
        x = ox + Math.round((ow - w) / 2);
        y = oy + oh - h;
        break;
      default: {
        const o = linearResizeFromHandle(handle, ox, oy, ow, oh, dx, dy);
        x = o.x;
        y = o.y;
        w = o.w;
        h = o.h;
      }
    }
  }

  el.x = Math.round(x);
  el.y = Math.round(y);
  el.w = Math.round(w);
  el.h = Math.round(h);
}

function snapFromDraft(d: LayoutPreset): LayoutSnapshot {
  return {
    marginTopMm: d.marginTopMm,
    marginRightMm: d.marginRightMm,
    marginBottomMm: d.marginBottomMm,
    marginLeftMm: d.marginLeftMm,
    headerBandMm: d.headerBandMm,
    footerBandMm: d.footerBandMm,
  };
}

function metrics(): PaperLayoutMetrics | null {
  if (!draft) return null;
  return computePaperLayout(draft.paperKind, draft.orientation, snapFromDraft(draft));
}

function zoneDims(zone: "header" | "footer"): { zw: number; zh: number } {
  const m = metrics();
  if (!m) return { zw: 100, zh: 40 };
  return { zw: m.contentW, zh: zone === "header" ? m.hb : m.fb };
}

function clampAllZoneElements(): void {
  if (!draft) return;
  const hd = zoneDims("header");
  for (const el of draft.headerElements) clampZoneElement(el, hd.zw, hd.zh);
  const fd = zoneDims("footer");
  for (const el of draft.footerElements) clampZoneElement(el, fd.zw, fd.zh);
}

function primarySelId(): string | undefined {
  return sel.k === "el" ? sel.ids[0] : undefined;
}

function findSelEl(): LayoutZoneElement | undefined {
  if (!draft || sel.k !== "el") return undefined;
  const pid = primarySelId();
  if (!pid) return undefined;
  const list = sel.zone === "header" ? draft.headerElements : draft.footerElements;
  return list.find((x) => x.id === pid);
}

function listForZone(zone: "header" | "footer"): LayoutZoneElement[] {
  if (!draft) return [];
  return zone === "header" ? draft.headerElements : draft.footerElements;
}

/**
 * 纸张预览块在 .lvis-scroll 滚动坐标系下的矩形。
 * 左上角用 #lvis-zoom-outer 的 getBoundingClientRect（视口对齐）；宽高用 outer.offsetWidth/Height，
 * 与 applyLvisZoom 写入的尺寸一致。仅用 inner wrap 的 BCR 在部分布局下 width 会异常偏小；
 * 仅用 outer BCR 的宽高则可能与子元素 transform 后的亚像素不一致，二者拆开可避免 frac 爆炸。
 */
function lvisPaperRectInScrollCoords(sc: HTMLElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const outer = document.getElementById("lvis-zoom-outer");
  if (!outer) return { left: 0, top: 0, width: 0, height: 0 };
  const scr = sc.getBoundingClientRect();
  const or = outer.getBoundingClientRect();
  const w = outer.offsetWidth;
  const h = outer.offsetHeight;
  if (w <= 0 || h <= 0) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left: sc.scrollLeft + (or.left - scr.left),
    top: sc.scrollTop + (or.top - scr.top),
    width: w,
    height: h,
  };
}

/** 把指针限制在预览滚动控件的可视矩形内（锚点在预览外时投射到最近边缘） */
function lvisClampClientToScrollViewport(scroll: HTMLElement, clientX: number, clientY: number): {
  x: number;
  y: number;
} {
  const r = scroll.getBoundingClientRect();
  const eps = 1e-4;
  return {
    x: Math.min(r.right - eps, Math.max(r.left + eps, clientX)),
    y: Math.min(r.bottom - eps, Math.max(r.top + eps, clientY)),
  };
}

function applyLvisZoom(): void {
  const outer = document.getElementById("lvis-zoom-outer");
  const wrap = document.getElementById("lvis-page-scale-wrap");
  const pct = document.getElementById("lvis-zoom-pct");
  if (wrap) {
    wrap.style.transform = `scale(${lvisZoom})`;
    wrap.style.transformOrigin = "top left";
  }
  if (outer && wrap) {
    const pw = wrap.offsetWidth > 0 ? wrap.offsetWidth : 1;
    const ph = wrap.offsetHeight > 0 ? wrap.offsetHeight : 1;
    outer.style.width = `${Math.ceil(pw * lvisZoom)}px`;
    outer.style.height = `${Math.ceil(ph * lvisZoom)}px`;
  }
  const p = Math.round(lvisZoom * 100);
  if (pct) pct.textContent = `${p}%`;
}

/**
 * 以视口中的屏幕点为缩放锚点：缩放前后，该点下方的纸张位置（含纸张外侧 extrapolate）保持在同一屏幕像素。
 * clientX/Y 为浏览器视口坐标（与 WheelEvent / PointerEvent 一致）。
 */
function applyLvisZoomAnchoredAt(clientX: number, clientY: number): void {
  const scroll = document.querySelector(".lvis-scroll") as HTMLElement | null;
  const outer = document.getElementById("lvis-zoom-outer");
  if (!scroll || !outer) {
    applyLvisZoom();
    return;
  }
  const pr = lvisPaperRectInScrollCoords(scroll);
  if (pr.width <= 0 || pr.height <= 0) {
    applyLvisZoom();
    return;
  }

  const anchor = lvisClampClientToScrollViewport(scroll, clientX, clientY);
  const sr = scroll.getBoundingClientRect();
  const sx = scroll.scrollLeft + (anchor.x - sr.left);
  const sy = scroll.scrollTop + (anchor.y - sr.top);
  const fracX = (sx - pr.left) / pr.width;
  const fracY = (sy - pr.top) / pr.height;

  applyLvisZoom();

  // 立即同步 scroll，避免连续 wheel 在下一轮仍用陈旧 scrollLeft 与已更新的纸张尺寸算 frac。
  void outer.offsetHeight;
  void scroll.offsetHeight;

  const pr2 = lvisPaperRectInScrollCoords(scroll);
  if (pr2.width > 0 && pr2.height > 0) {
    const scr = scroll.getBoundingClientRect();
    const ax = anchor.x;
    const ay = anchor.y;
    const nextLeft = Math.round(pr2.left + pr2.width * fracX - (ax - scr.left));
    const nextTop = Math.round(pr2.top + pr2.height * fracY - (ay - scr.top));
    scroll.scrollLeft = nextLeft;
    scroll.scrollTop = nextTop;
  }
}

/** 缩放后保持当前视口中心落在纸张上的相对位置（窗口尺寸变化等） */
function applyLvisZoomAndPreserveView(): void {
  const scroll = document.querySelector(".lvis-scroll") as HTMLElement | null;
  const outer = document.getElementById("lvis-zoom-outer");
  let fracX = 0.5;
  let fracY = 0.5;
  if (scroll && outer) {
    const pr = lvisPaperRectInScrollCoords(scroll);
    if (pr.width > 0 && pr.height > 0) {
      const cx = scroll.scrollLeft + scroll.clientWidth / 2;
      const cy = scroll.scrollTop + scroll.clientHeight / 2;
      fracX = (cx - pr.left) / pr.width;
      fracY = (cy - pr.top) / pr.height;
      fracX = Math.min(1, Math.max(0, fracX));
      fracY = Math.min(1, Math.max(0, fracY));
    }
  }
  applyLvisZoom();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const sc = document.querySelector(".lvis-scroll") as HTMLElement | null;
      const out = document.getElementById("lvis-zoom-outer");
      if (!sc || !out) return;
      const pr2 = lvisPaperRectInScrollCoords(sc);
      if (pr2.width <= 0 || pr2.height <= 0) return;
      sc.scrollLeft = Math.round(pr2.left + pr2.width * fracX - sc.clientWidth / 2);
      sc.scrollTop = Math.round(pr2.top + pr2.height * fracY - sc.clientHeight / 2);
    });
  });
}

function centerLvisScrollOnPage(): void {
  const sc = document.querySelector(".lvis-scroll") as HTMLElement | null;
  const out = document.getElementById("lvis-zoom-outer");
  if (!sc || !out) return;
  const pr = lvisPaperRectInScrollCoords(sc);
  if (pr.width <= 0 || pr.height <= 0) return;
  sc.scrollLeft = Math.round(pr.left + pr.width / 2 - sc.clientWidth / 2);
  sc.scrollTop = Math.round(pr.top + pr.height / 2 - sc.clientHeight / 2);
}

/** 纸张完全不在视口内时再拉回（大块留白下尽量少打断用户拖动） */
function ensureLvisPageVisible(): void {
  const scroll = document.querySelector(".lvis-scroll") as HTMLElement | null;
  const outer = document.getElementById("lvis-zoom-outer");
  if (!scroll || !outer) return;
  const sl = scroll.scrollLeft;
  const st = scroll.scrollTop;
  const vw = scroll.clientWidth;
  const vh = scroll.clientHeight;
  const pr = lvisPaperRectInScrollCoords(scroll);
  const rx = Math.min(sl + vw, pr.left + pr.width) - Math.max(sl, pr.left);
  const ry = Math.min(st + vh, pr.top + pr.height) - Math.max(st, pr.top);
  if (rx <= 2 || ry <= 2) {
    centerLvisScrollOnPage();
  }
}

/** 在预览区内完整显示整张纸（宽高同时适配）并居中，避免只按宽度裁切导致页眉页脚滚出视野 */
function lvisZoomFit(): void {
  const viewport = document.querySelector(".lvis-scroll") as HTMLElement | null;
  const wrap = document.getElementById("lvis-page-scale-wrap");
  const page = document.getElementById("lvis-page");
  if (!viewport || !page) return;
  const pad = 24;
  const mw = Math.max(80, viewport.clientWidth - pad * 2);
  const mh = Math.max(80, viewport.clientHeight - pad * 2);
  const w = wrap && wrap.offsetWidth > 0 ? wrap.offsetWidth : page.offsetWidth;
  const h = wrap && wrap.offsetHeight > 0 ? wrap.offsetHeight : page.offsetHeight;
  if (w <= 0 || h <= 0) return;
  const scale = Math.min(mw / w, mh / h);
  lvisZoom = Math.min(2, Math.max(0.35, scale));
  applyLvisZoom();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      centerLvisScrollOnPage();
      requestAnimationFrame(() => centerLvisScrollOnPage());
    });
  });
}

function alignSelection(mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom"): void {
  if (!draft || sel.k !== "el") return;
  saveLvisUndoCheckpoint("once");
  const z = sel.zone;
  const { zw, zh } = zoneDims(z);
  const list = listForZone(z);
  const multi = sel.ids.length >= 2;
  const primary = list.find((x) => x.id === sel.ids[0]);
  if (!primary) return;

  for (const id of sel.ids) {
    const el = list.find((x) => x.id === id);
    if (!el) continue;
    if (!multi) {
      if (mode === "left") el.x = 0;
      else if (mode === "centerX") el.x = Math.max(0, Math.round((zw - el.w) / 2));
      else if (mode === "right") el.x = Math.max(0, zw - el.w);
      else if (mode === "top") el.y = 0;
      else if (mode === "centerY") el.y = Math.max(0, Math.round((zh - el.h) / 2));
      else if (mode === "bottom") el.y = Math.max(0, zh - el.h);
    } else {
      if (el.id === primary.id) continue;
      if (mode === "left") el.x = primary.x;
      else if (mode === "centerX")
        el.x = Math.max(0, Math.round(primary.x + primary.w / 2 - el.w / 2));
      else if (mode === "right") el.x = Math.max(0, Math.round(primary.x + primary.w - el.w));
      else if (mode === "top") el.y = primary.y;
      else if (mode === "centerY")
        el.y = Math.max(0, Math.round(primary.y + primary.h / 2 - el.h / 2));
      else if (mode === "bottom") el.y = Math.max(0, Math.round(primary.y + primary.h - el.h));
    }
    snapElInZone(el, z);
  }
  renderLvis();
  syncElementInputsFromModel();
}

function stretchPrimary(fill: "width" | "height" | "both"): void {
  const el = findSelEl();
  if (!draft || sel.k !== "el" || !el) return;
  saveLvisUndoCheckpoint("once");
  const z = sel.zone;
  const { zw, zh } = zoneDims(z);
  if (fill === "width" || fill === "both") {
    el.x = 0;
    el.w = zw;
  }
  if (fill === "height" || fill === "both") {
    el.y = 0;
    el.h = zh;
  }
  snapElInZone(el, z);
  renderLvis();
  syncElementInputsFromModel();
}

/** 其余选中项与首个选中项同宽 / 同高 */
function matchOthersDimension(dim: "w" | "h"): void {
  if (!draft || sel.k !== "el" || sel.ids.length < 2) return;
  const z = sel.zone;
  const list = listForZone(z);
  const primary = list.find((x) => x.id === sel.ids[0]);
  if (!primary) return;
  saveLvisUndoCheckpoint("once");
  const ref = dim === "w" ? primary.w : primary.h;
  for (let i = 1; i < sel.ids.length; i++) {
    const el = list.find((x) => x.id === sel.ids[i]);
    if (!el) continue;
    if (dim === "w") el.w = ref;
    else el.h = ref;
    snapElInZone(el, z);
  }
  renderLvis();
  syncElementInputsFromModel();
}

/** 其余选中项与首个选中项宽、高一致 */
function matchOthersDimensionBoth(): void {
  if (!draft || sel.k !== "el" || sel.ids.length < 2) return;
  const z = sel.zone;
  const list = listForZone(z);
  const primary = list.find((x) => x.id === sel.ids[0]);
  if (!primary) return;
  saveLvisUndoCheckpoint("once");
  const refW = primary.w;
  const refH = primary.h;
  for (let i = 1; i < sel.ids.length; i++) {
    const el = list.find((x) => x.id === sel.ids[i]);
    if (!el) continue;
    el.w = refW;
    el.h = refH;
    snapElInZone(el, z);
  }
  renderLvis();
  syncElementInputsFromModel();
}

/** 将所有选中项宽或高设为当前页眉/页脚区带的可用尺寸 */
function matchSelectionToZoneDimension(dim: "w" | "h"): void {
  if (!draft || sel.k !== "el" || sel.ids.length < 1) return;
  const z = sel.zone;
  const { zw, zh } = zoneDims(z);
  const list = listForZone(z);
  saveLvisUndoCheckpoint("once");
  const v = dim === "w" ? zw : zh;
  for (const id of sel.ids) {
    const el = list.find((x) => x.id === id);
    if (!el) continue;
    if (dim === "w") el.w = v;
    else el.h = v;
    snapElInZone(el, z);
  }
  renderLvis();
  syncElementInputsFromModel();
}

/** 对齐工具栏：悬停说明（fixed，避免侧栏 overflow 裁切） */
function bindLvisAlignTooltips(): void {
  let host = document.getElementById("lvis-tooltip-host") as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = "lvis-tooltip-host";
    host.className = "lvis-tooltip-host";
    host.setAttribute("role", "tooltip");
    host.hidden = true;
    document.body.appendChild(host);
  }

  const hide = () => {
    host!.hidden = true;
    host!.textContent = "";
  };

  const show = (anchor: HTMLElement, text: string) => {
    host!.textContent = text;
    host!.hidden = false;
    const r = anchor.getBoundingClientRect();
    const m = 8;
    let left = Math.round(r.left + r.width / 2);
    let top = Math.round(r.bottom + m);
    host!.style.left = `${left}px`;
    host!.style.top = `${top}px`;
    host!.style.transform = "translateX(-50%)";

    requestAnimationFrame(() => {
      const tw = host!.offsetWidth;
      const th = host!.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (top + th > vh - m) {
        top = Math.round(r.top - m - th);
        host!.style.top = `${top}px`;
      }
      let cx = left;
      const half = tw / 2;
      if (cx + half > vw - m) cx = vw - m - half;
      if (cx - half < m) cx = m + half;
      host!.style.left = `${Math.round(cx)}px`;
    });
  };

  const root = document.getElementById("lvis-align-actions");
  if (!root || root.dataset.lvisTipDelegation === "1") return;
  root.dataset.lvisTipDelegation = "1";

  root.addEventListener("mouseover", (e) => {
    const el = (e.target as HTMLElement).closest("[data-lvis-tip], [data-lvis-tip-zone], [data-lvis-tip-multi]");
    if (!el || !root.contains(el)) return;
    const multi = root.classList.contains("lvis-align--multi");
    let text =
      (multi ? el.getAttribute("data-lvis-tip-multi") : el.getAttribute("data-lvis-tip-zone"))?.trim() ??
      el.getAttribute("data-lvis-tip")?.trim();
    if (!text) return;
    show(el as HTMLElement, text);
  });
  root.addEventListener("mouseout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && root.contains(related)) return;
    hide();
  });

  if (!document.documentElement.dataset.lvisTipScrollHide) {
    document.documentElement.dataset.lvisTipScrollHide = "1";
    window.addEventListener(
      "scroll",
      () => {
        if (host && !host.hidden) hide();
      },
      true,
    );
  }
}

/** 从 wheel 解析缩放锚点的屏幕坐标（无效时用最近 pointermove；仍为 (0,0) 时用预览区中心） */
function lvisResolveWheelAnchorClient(e: WheelEvent): { x: number; y: number } {
  let cx = e.clientX;
  let cy = e.clientY;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    cx = lvisLastPointerClient.x;
    cy = lvisLastPointerClient.y;
  }
  const scroll = document.querySelector(".lvis-scroll") as HTMLElement | null;
  if (scroll && cx === 0 && cy === 0) {
    const sr = scroll.getBoundingClientRect();
    cx = sr.left + sr.width / 2;
    cy = sr.top + sr.height / 2;
  }
  return { x: cx, y: cy };
}

/** 屏幕坐标是否在预览滚动控件可视矩形内 */
function lvisClientInScrollViewport(scroll: HTMLElement, clientX: number, clientY: number): boolean {
  const r = scroll.getBoundingClientRect();
  return (
    clientX >= r.left &&
    clientX <= r.right &&
    clientY >= r.top &&
    clientY <= r.bottom
  );
}

/** Chromium/Safari 下触控板捏合缩放多为 PIXEL + ctrl/meta */
function lvisIsLikelyTrackpadPinchWheel(e: WheelEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
}

/** 新缩放会话第一帧：优先使用落在预览区内的 wheel 坐标（静止光标也能对准）；否则再按捏合/鼠标回退 */
function lvisComputeWheelGestureAnchor(e: WheelEvent): { x: number; y: number } {
  const scroll = document.querySelector(".lvis-scroll") as HTMLElement | null;
  if (!scroll) return { x: e.clientX, y: e.clientY };

  // WheelEvent.client 与光标一致；pointermove 在未移动时不会触发，lastPtr 可能仍为 (0,0)，误判为中心锚点。
  if (lvisClientInScrollViewport(scroll, e.clientX, e.clientY)) {
    return lvisClampClientToScrollViewport(scroll, e.clientX, e.clientY);
  }

  if (lvisIsLikelyTrackpadPinchWheel(e)) {
    const lx = lvisLastPointerClient.x;
    const ly = lvisLastPointerClient.y;
    if (lvisClientInScrollViewport(scroll, lx, ly)) return { x: lx, y: ly };
    const sr = scroll.getBoundingClientRect();
    return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
  }
  return lvisResolveWheelAnchorClient(e);
}

export function initReportLayoutVisual(d: LayoutVisualDeps): void {
  deps = d;

  document.getElementById("btn-lvis-back")?.addEventListener("click", () => {
    draft = null;
    sel = { k: "idle" };
    resetLvisUndoRedo();
    lvisWheelGestureAnchor = null;
    lvisWheelLastTime = 0;
    deps.showPage("layout");
  });

  document.getElementById("btn-lvis-undo")?.addEventListener("click", () => undoLvis());
  document.getElementById("btn-lvis-redo")?.addEventListener("click", () => redoLvis());

  document.getElementById("btn-lvis-save")?.addEventListener("click", () => {
    if (!draft) return;
    clampAllZoneElements();
    draft.updatedAt = new Date().toISOString();
    const list = loadLayoutPresets();
    const idx = list.findIndex((x) => x.id === draft!.id);
    const saved = hydrateLayoutPreset(draft);
    if (idx >= 0) list[idx] = saved;
    else list.push(saved);
    saveLayoutPresets(list);
    alert("版式已保存（含页眉页脚可视化内容）");
  });

  document.querySelectorAll<HTMLElement>("[data-layout-vis-tool]").forEach((node) => {
    node.addEventListener("dragstart", (e) => {
      const t = node.dataset.layoutVisTool as LayoutControlType;
      e.dataTransfer?.setData("application/x-rptp-layout-vis", t);
      e.dataTransfer?.setData("text/plain", t);
      e.dataTransfer!.effectAllowed = "copy";
    });
  });

  setupZoneCanvas(document.getElementById("lvis-header-canvas"), "header");
  setupZoneCanvas(document.getElementById("lvis-footer-canvas"), "footer");

  document.getElementById("lvis-body-zone")?.addEventListener("click", (e) => {
    e.stopPropagation();
    sel = { k: "global" };
    renderLvis();
    syncLvisDrawer();
  });

  const scrollPad = document.querySelector(".lvis-scroll-pad");
  scrollPad?.addEventListener("click", (e) => {
    const page = document.getElementById("lvis-page");
    if (!draft || !page) return;
    if (page.contains(e.target as Node)) return;
    sel = { k: "idle" };
    renderLvis();
    syncLvisDrawer();
  });

  document.querySelector(".lvis-zoom-strip")?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("btn-lvis-zoom-fit")?.addEventListener("click", () => {
    lvisZoomFit();
  });

  const lvisSection = document.getElementById("page-layout-visual");
  document.querySelector(".lvis-scroll")?.addEventListener(
    "pointermove",
    (e) => {
      const scroll = e.currentTarget as HTMLElement;
      const cx = e.clientX;
      const cy = e.clientY;
      if (lvisClientInScrollViewport(scroll, cx, cy)) {
        lvisLastPointerClient.x = cx;
        lvisLastPointerClient.y = cy;
      }
    },
    { passive: true },
  );

  /* 捕获在整页 section：防止 Ctrl+滚轮在工具条等处触发浏览器整页缩放 */
  lvisSection?.addEventListener(
    "wheel",
    (e) => {
      if (!draft) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      const nz = Math.min(2, Math.max(0.35, lvisZoom * factor));
      if (Math.abs(nz - lvisZoom) < 1e-4) return;

      const now = performance.now();
      const gapElapsed = now - lvisWheelLastTime > LVIS_WHEEL_GESTURE_GAP_MS;
      lvisWheelLastTime = now;

      if (gapElapsed || !lvisWheelGestureAnchor) {
        lvisWheelGestureAnchor = lvisComputeWheelGestureAnchor(e);
      }

      lvisZoom = nz;
      applyLvisZoomAnchoredAt(lvisWheelGestureAnchor.x, lvisWheelGestureAnchor.y);
    },
    { passive: false, capture: true },
  );

  document.getElementById("lvis-snap-enabled")?.addEventListener("change", () => {
    const c = document.getElementById("lvis-snap-enabled") as HTMLInputElement | null;
    snapEnabled = c?.checked ?? true;
  });
  document.getElementById("lvis-snap-grid")?.addEventListener("input", () => {
    const n = document.getElementById("lvis-snap-grid") as HTMLInputElement | null;
    snapGridPx = Math.max(2, Math.min(64, parseInt(n?.value ?? "8", 10) || 8));
    if (n) n.value = String(snapGridPx);
  });

  const bindAlign = (id: string, fn: () => void) => {
    document.getElementById(id)?.addEventListener("click", fn);
  };
  bindAlign("lvis-al-left", () => alignSelection("left"));
  bindAlign("lvis-al-center-x", () => alignSelection("centerX"));
  bindAlign("lvis-al-right", () => alignSelection("right"));
  bindAlign("lvis-al-top", () => alignSelection("top"));
  bindAlign("lvis-al-center-y", () => alignSelection("centerY"));
  bindAlign("lvis-al-bottom", () => alignSelection("bottom"));
  bindAlign("lvis-fill-w", () => stretchPrimary("width"));
  bindAlign("lvis-fill-h", () => stretchPrimary("height"));
  bindAlign("lvis-fill-both", () => stretchPrimary("both"));
  bindAlign("lvis-match-w", () => matchOthersDimension("w"));
  bindAlign("lvis-match-h", () => matchOthersDimension("h"));
  bindAlign("lvis-match-both", () => matchOthersDimensionBoth());
  bindAlign("lvis-match-zone-w", () => matchSelectionToZoneDimension("w"));
  bindAlign("lvis-match-zone-h", () => matchSelectionToZoneDimension("h"));

  bindDrawerInputs();
  bindLvisAlignVisualGrid();
  bindLvisAlignTooltips();

  document.getElementById("btn-lvis-el-delete")?.addEventListener("click", () => {
    if (!draft || sel.k !== "el") return;
    saveLvisUndoCheckpoint("once");
    const z = sel.zone;
    const rm = new Set(sel.ids);
    if (z === "header") draft.headerElements = draft.headerElements.filter((x) => !rm.has(x.id));
    else draft.footerElements = draft.footerElements.filter((x) => !rm.has(x.id));
    sel = { k: z === "header" ? "headerBand" : "footerBand" };
    renderLvis();
    syncLvisDrawer();
  });

  window.addEventListener("mousemove", onWinMove);
  window.addEventListener("mouseup", () => {
    if (resizeDrag && draft) {
      const list = resizeDrag.zone === "header" ? draft.headerElements : draft.footerElements;
      const el = list.find((x) => x.id === resizeDrag!.id);
      if (el) snapElInZone(el, resizeDrag.zone);
      renderLvis();
      syncElementInputsFromModel();
    }
    resizeDrag = null;
    if (dragMove && draft) {
      const list = dragMove.zone === "header" ? draft.headerElements : draft.footerElements;
      const el = list.find((x) => x.id === dragMove!.id);
      if (el) snapElInZone(el, dragMove.zone);
      renderLvis();
      syncElementInputsFromModel();
    }
    dragMove = null;
  });

  window.addEventListener("keydown", (e) => {
    const page = document.getElementById("page-layout-visual");
    if (!page?.classList.contains("is-visible")) return;
    const t = e.target as HTMLElement;
    const typing =
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable === true;

    const metaOrCtrl = e.ctrlKey || e.metaKey;
    if (metaOrCtrl && String(e.key).toLowerCase() === "z" && !e.altKey) {
      if (!typing) {
        e.preventDefault();
        if (e.shiftKey) redoLvis();
        else undoLvis();
      }
      return;
    }
    if (metaOrCtrl && String(e.key).toLowerCase() === "y" && !e.altKey && !e.shiftKey) {
      if (!typing) {
        e.preventDefault();
        redoLvis();
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (typing) return;
      if (sel.k !== "el" || !draft) return;
      e.preventDefault();
      document.getElementById("btn-lvis-el-delete")?.dispatchEvent(new Event("click"));
      return;
    }

    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown"
    ) {
      if (typing) return;
      if (sel.k !== "el" || !draft || sel.ids.length !== 1) return;
      e.preventDefault();
      if (e.key === "ArrowLeft") nudgeSelectedElement(-1, 0);
      else if (e.key === "ArrowRight") nudgeSelectedElement(1, 0);
      else if (e.key === "ArrowUp") nudgeSelectedElement(0, -1);
      else nudgeSelectedElement(0, 1);
    }
  });

  window.addEventListener("resize", () => {
    const p = document.getElementById("page-layout-visual");
    if (p?.classList.contains("is-visible")) applyLvisZoomAndPreserveView();
  });
}

function setupZoneCanvas(canvas: HTMLElement | null, zone: "header" | "footer"): void {
  if (!canvas) return;
  canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!draft) return;
    const raw = e.dataTransfer?.getData("application/x-rptp-layout-vis") || e.dataTransfer?.getData("text/plain");
    const type = raw as LayoutControlType;
    const ok = type === "text" || type === "box" || type === "image" || type === "pageNumber" || type === "date";
    if (!ok) return;
    saveLvisUndoCheckpoint("once");
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left - 10);
    const y = Math.round(e.clientY - rect.top - 8);
    const el = makeLayoutZoneElement(type);
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    clampZoneElement(el, zoneDims(zone).zw, zoneDims(zone).zh);
    snapElInZone(el, zone);
    if (zone === "header") draft!.headerElements.push(el);
    else draft!.footerElements.push(el);
    sel = { k: "el", zone, ids: [el.id] };
    renderLvis();
    syncLvisDrawer();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (!draft) return;
    const rh = (e.target as HTMLElement).closest("[data-layout-resize-handle]");
    if (rh && canvas.contains(rh)) {
      const handle = rh.getAttribute("data-layout-resize-handle");
      const rid = rh.getAttribute("data-layout-zone-el-id");
      if (!handle || !rid) return;
      const list = zone === "header" ? draft.headerElements : draft.footerElements;
      const el = list.find((x) => x.id === rid);
      if (!el) return;
      saveLvisUndoCheckpoint("once");
      sel = { k: "el", zone, ids: [rid] };
      resizeDrag = {
        zone,
        id: rid,
        handle,
        sx: e.clientX,
        sy: e.clientY,
        ox: el.x,
        oy: el.y,
        ow: el.w,
        oh: el.h,
      };
      dragMove = null;
      e.preventDefault();
      e.stopPropagation();
      renderLvis();
      syncLvisDrawer();
      return;
    }
    const node = (e.target as HTMLElement).closest("[data-layout-zone-el-id]");
    if (!node || !canvas.contains(node)) return;
    const id = node.getAttribute("data-layout-zone-el-id");
    if (!id) return;
    const list = zone === "header" ? draft.headerElements : draft.footerElements;
    const el = list.find((x) => x.id === id);
    if (!el) return;
    saveLvisUndoCheckpoint("once");
    if (e.shiftKey && sel.k === "el" && sel.zone === zone) {
      const ids = toggleSelId(sel.ids, id);
      sel =
        ids.length === 0 ? { k: zone === "header" ? "headerBand" : "footerBand" } : { k: "el", zone, ids };
    } else {
      sel = { k: "el", zone, ids: [id] };
    }
    dragMove = { zone, id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
    resizeDrag = null;
    e.preventDefault();
    renderLvis();
    syncLvisDrawer();
  });

  canvas.addEventListener("click", (e) => {
    if (!draft) return;
    e.stopPropagation();
    const t = e.target as HTMLElement;
    if (t.closest("[data-layout-resize-handle]")) return;
    if (t.closest("[data-layout-zone-el-id]")) return;
    if (t === canvas || t.classList.contains("lvis-zone-canvas")) {
      sel = zone === "header" ? { k: "headerBand" } : { k: "footerBand" };
    }
    renderLvis();
    syncLvisDrawer();
  });
}

function toggleSelId(ids: string[], id: string): string[] {
  const s = new Set(ids);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  return [...s];
}

function onWinMove(e: MouseEvent): void {
  if (resizeDrag && draft) {
    const list = resizeDrag.zone === "header" ? draft.headerElements : draft.footerElements;
    const el = list.find((x) => x.id === resizeDrag!.id);
    if (!el) return;
    const dx = e.clientX - resizeDrag.sx;
    const dy = e.clientY - resizeDrag.sy;
    applyResizeFromHandle(
      el,
      resizeDrag.handle,
      resizeDrag.ox,
      resizeDrag.oy,
      resizeDrag.ow,
      resizeDrag.oh,
      dx,
      dy,
      e.shiftKey,
    );
    clampZoneElement(el, zoneDims(resizeDrag.zone).zw, zoneDims(resizeDrag.zone).zh);
    renderLvis();
    syncElementInputsFromModel();
    return;
  }
  if (!dragMove || !draft) return;
  const list = dragMove.zone === "header" ? draft.headerElements : draft.footerElements;
  const el = list.find((x) => x.id === dragMove!.id);
  if (!el) return;
  el.x = dragMove.ox + (e.clientX - dragMove.sx);
  el.y = dragMove.oy + (e.clientY - dragMove.sy);
  clampZoneElement(el, zoneDims(dragMove.zone).zw, zoneDims(dragMove.zone).zh);
  renderLvis();
  syncElementInputsFromModel();
}

function syncLvisAlignVisualHighlight(): void {
  const grid = document.getElementById("lvis-align-visual-grid");
  if (!grid) return;
  const ix = document.getElementById("lvis-e-align-x") as HTMLInputElement | null;
  const iy = document.getElementById("lvis-e-align-y") as HTMLInputElement | null;
  const ax = ix?.value ?? "start";
  const ay = iy?.value ?? "center";
  grid.querySelectorAll<HTMLButtonElement>(".lvis-align-visual-cell").forEach((b) => {
    const match =
      b.getAttribute("data-lvis-align-x") === ax && b.getAttribute("data-lvis-align-y") === ay;
    b.classList.toggle("is-active", match);
    b.setAttribute("aria-pressed", match ? "true" : "false");
  });
}

function bindLvisAlignVisualGrid(): void {
  document.getElementById("lvis-align-visual-grid")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-lvis-align-x]");
    if (!btn || !draft || sel.k !== "el") return;
    const ax = btn.getAttribute("data-lvis-align-x");
    const ay = btn.getAttribute("data-lvis-align-y");
    if (!ax || !ay) return;
    saveLvisUndoCheckpoint("once");
    const ix = document.getElementById("lvis-e-align-x") as HTMLInputElement | null;
    const iy = document.getElementById("lvis-e-align-y") as HTMLInputElement | null;
    if (ix) ix.value = ax;
    if (iy) iy.value = ay;
    applyDrawerToDraft();
    syncLvisAlignVisualHighlight();
    renderLvis();
  });
}

function bindDrawerInputs(): void {
  const onChange = () => {
    saveLvisUndoCheckpoint("merge");
    applyDrawerToDraft();
    renderLvis();
    syncElementInputsFromModel();
  };
  const ids = [
    "lvis-field-name",
    "lvis-field-page-role",
    "lvis-field-paper",
    "lvis-field-orientation",
    "lvis-g-mt",
    "lvis-g-mr",
    "lvis-g-mb",
    "lvis-g-ml",
    "lvis-band-mm",
    "lvis-e-text",
    "lvis-e-x",
    "lvis-e-y",
    "lvis-e-w",
    "lvis-e-h",
    "lvis-e-color",
    "lvis-e-bg",
    "lvis-e-font",
    "lvis-e-align-x",
    "lvis-e-align-y",
    "lvis-e-date-format",
    "lvis-e-img-url",
  ];
  for (const id of ids) {
    document.getElementById(id)?.addEventListener("input", onChange);
    document.getElementById(id)?.addEventListener("change", onChange);
  }

  document.getElementById("lvis-e-img-file")?.addEventListener("change", (ev) => {
    const inp = ev.target as HTMLInputElement;
    const f = inp.files?.[0];
    if (!f || !draft || sel.k !== "el") return;
    const r = new FileReader();
    r.onload = () => {
      const el = findSelEl();
      if (el?.type === "image") {
        saveLvisUndoCheckpoint("once");
        el.imageSrc = String(r.result || "");
        renderLvis();
        syncLvisDrawer();
      }
    };
    r.readAsDataURL(f);
    inp.value = "";
  });
}

function applyDrawerToDraft(): void {
  if (!draft) return;
  if (sel.k === "global") {
    applyGlobalFromInputs();
    clampAllZoneElements();
  } else if (sel.k === "headerBand" || sel.k === "footerBand") {
    const inp = document.getElementById("lvis-band-mm") as HTMLInputElement | null;
    const v = Math.max(0, parseFloat(inp?.value ?? "0") || 0);
    if (sel.k === "headerBand") draft.headerBandMm = v;
    else draft.footerBandMm = v;
    clampAllZoneElements();
  } else if (sel.k === "el") {
    applyElementFromInputs();
  }
}

function applyGlobalFromInputs(): void {
  if (!draft) return;
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value;
  draft.name = (g("lvis-field-name") ?? "").trim() || draft.name;
  const pr = g("lvis-field-page-role");
  draft.pageRole = pr === "cover" || pr === "back" ? pr : "normal";
  draft.paperKind = (g("lvis-field-paper") as PaperKind) || draft.paperKind;
  draft.orientation = g("lvis-field-orientation") === "landscape" ? "landscape" : "portrait";
  draft.marginTopMm = Math.max(0, parseFloat(g("lvis-g-mt") ?? "0") || 0);
  draft.marginRightMm = Math.max(0, parseFloat(g("lvis-g-mr") ?? "0") || 0);
  draft.marginBottomMm = Math.max(0, parseFloat(g("lvis-g-mb") ?? "0") || 0);
  draft.marginLeftMm = Math.max(0, parseFloat(g("lvis-g-ml") ?? "0") || 0);
}

function applyElementFromInputs(): void {
  const el = findSelEl();
  if (!el || !draft || sel.k !== "el") return;
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value;
  if (el.type === "text" || el.type === "box") el.text = g("lvis-e-text") ?? el.text;
  el.x = Math.max(0, parseInt(g("lvis-e-x") ?? String(el.x), 10) || 0);
  el.y = Math.max(0, parseInt(g("lvis-e-y") ?? String(el.y), 10) || 0);
  el.w = Math.max(16, parseInt(g("lvis-e-w") ?? String(el.w), 10) || 16);
  el.h = Math.max(16, parseInt(g("lvis-e-h") ?? String(el.h), 10) || 16);
  const c = g("lvis-e-color");
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) el.color = c;
  el.bgColor = g("lvis-e-bg") ?? el.bgColor;
  el.fontSize = Math.max(8, parseInt(g("lvis-e-font") ?? String(el.fontSize), 10) || 12);
  el.alignX = normalizeAlignAxis(g("lvis-e-align-x"), el.alignX);
  el.alignY = normalizeAlignAxis(g("lvis-e-align-y"), el.alignY);
  el.dateFormat = g("lvis-e-date-format") ?? el.dateFormat;
  const url = g("lvis-e-img-url");
  if (url !== undefined && el.type === "image") el.imageSrc = url;
  snapElInZone(el, sel.zone);
}

function syncElementInputsFromModel(): void {
  const el = findSelEl();
  if (!el) return;
  const set = (id: string, v: string | number) => {
    const n = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (n) n.value = String(v);
  };
  set("lvis-e-text", el.text);
  set("lvis-e-x", el.x);
  set("lvis-e-y", el.y);
  set("lvis-e-w", el.w);
  set("lvis-e-h", el.h);
  set("lvis-e-color", /^#[0-9A-Fa-f]{6}$/.test(el.color) ? el.color : "#18181b");
  set("lvis-e-bg", el.bgColor);
  set("lvis-e-font", el.fontSize);
  set("lvis-e-align-x", el.alignX);
  set("lvis-e-align-y", el.alignY);
  set("lvis-e-date-format", el.dateFormat);
  set("lvis-e-img-url", el.imageSrc);
  syncLvisAlignVisualHighlight();
}

export function openLayoutVisual(presetId: string): void {
  const list = loadLayoutPresets();
  const p = list.find((x) => x.id === presetId);
  if (!p) return;
  draft = hydrateLayoutPreset(JSON.parse(JSON.stringify(p)) as Partial<LayoutPreset>);
  draft.headerElements = draft.headerElements.map((x) => ({ ...x }));
  draft.footerElements = draft.footerElements.map((x) => ({ ...x }));
  sel = { k: "idle" };
  resetLvisUndoRedo();
  lvisZoom = 1;
  deps.showPage("layoutVisual");
  renderLvis();
  applyLvisZoom();
  requestAnimationFrame(() => {
    lvisZoomFit();
  });
  syncSnapUi();
  syncLvisDrawer();
}

function syncSnapUi(): void {
  const c = document.getElementById("lvis-snap-enabled") as HTMLInputElement | null;
  const n = document.getElementById("lvis-snap-grid") as HTMLInputElement | null;
  if (c) c.checked = snapEnabled;
  if (n) n.value = String(snapGridPx);
}

function renderLvis(): void {
  if (!draft) return;
  const m = metrics();
  if (!m) return;
  const pageEl = document.getElementById("lvis-page");
  const bodyZone = document.getElementById("lvis-body-zone");
  const hw = document.getElementById("lvis-header-wrap");
  const hc = document.getElementById("lvis-header-canvas");
  const fw = document.getElementById("lvis-footer-wrap");
  const fc = document.getElementById("lvis-footer-canvas");
  const meta = document.getElementById("lvis-meta");
  if (!pageEl || !bodyZone || !hw || !hc || !fw || !fc) return;

  pageEl.style.position = "relative";
  hw.style.position = "absolute";
  fw.style.position = "absolute";
  bodyZone.style.position = "absolute";

  pageEl.style.width = `${m.pageW}px`;
  pageEl.style.height = `${m.pageH}px`;

  hw.style.left = `${m.ml}px`;
  hw.style.top = `${m.mt}px`;
  hw.style.width = `${m.contentW}px`;
  hw.style.height = `${m.hb}px`;

  fw.style.left = `${m.ml}px`;
  fw.style.bottom = `${m.mb}px`;
  fw.style.width = `${m.contentW}px`;
  fw.style.height = `${m.fb}px`;

  bodyZone.style.left = `${m.ml}px`;
  bodyZone.style.top = `${m.mt + m.hb}px`;
  bodyZone.style.width = `${m.contentW}px`;
  bodyZone.style.height = `${m.contentH}px`;

  const headerIds =
    sel.k === "el" && sel.zone === "header" ? new Set(sel.ids) : undefined;
  const footerIds =
    sel.k === "el" && sel.zone === "footer" ? new Set(sel.ids) : undefined;
  const headerResize =
    sel.k === "el" && sel.zone === "header" && sel.ids.length === 1
      ? new Set(sel.ids)
      : undefined;
  const footerResize =
    sel.k === "el" && sel.zone === "footer" && sel.ids.length === 1
      ? new Set(sel.ids)
      : undefined;

  renderZoneElementsInto(hc, draft.headerElements, {
    selectedIds: headerIds,
    resizeHandlesForIds: headerResize,
    selectionChrome: true,
  });
  renderZoneElementsInto(fc, draft.footerElements, {
    selectedIds: footerIds,
    resizeHandlesForIds: footerResize,
    selectionChrome: true,
  });

  hw.classList.toggle(
    "lvis-zone-focused",
    sel.k === "headerBand" || (sel.k === "el" && sel.zone === "header"),
  );
  fw.classList.toggle(
    "lvis-zone-focused",
    sel.k === "footerBand" || (sel.k === "el" && sel.zone === "footer"),
  );
  bodyZone.classList.toggle("lvis-zone-focused", sel.k === "global");

  if (meta)
    meta.textContent = `${PAPER_LABEL[draft.paperKind]} · ${draft.orientation === "landscape" ? "横向" : "纵向"} · ${draft.name} · ${LAYOUT_PAGE_ROLE_LABEL[draft.pageRole]}`;

  applyLvisZoom();
  requestAnimationFrame(() => ensureLvisPageVisible());
}

function syncLvisDrawer(): void {
  const idle = document.getElementById("lvis-drawer-idle");
  const pg = document.getElementById("lvis-drawer-global");
  const pb = document.getElementById("lvis-drawer-band");
  const pe = document.getElementById("lvis-drawer-element");
  if (!draft || !idle || !pg || !pb || !pe) return;

  idle.hidden = sel.k !== "idle";
  pg.hidden = sel.k !== "global";
  pb.hidden = sel.k !== "headerBand" && sel.k !== "footerBand";
  pe.hidden = sel.k !== "el";

  const hintTop = document.getElementById("lvis-drawer-context-hint");
  if (hintTop) hintTop.hidden = sel.k === "idle";

  const multi = document.getElementById("lvis-drawer-multi");
  const alignBar = document.getElementById("lvis-align-actions");
  const multiHint = sel.k === "el" && sel.ids.length > 1;
  if (multi) {
    multi.hidden = !multiHint;
    if (multiHint) {
      multi.textContent = `已选 ${sel.ids.length} 个控件；右侧属性仅编辑首个选中项。对齐按钮在多选时为「互相对齐」（参照首个）；「同宽 / 同高 / 同尺寸」将其余项与首个一致；「区带宽 / 区带高」将所有选中项统一为当前页眉或页脚的可用宽高。「铺满区带」仍仅作用于首个选中项。`;
    }
  }
  if (alignBar) {
    alignBar.hidden = sel.k !== "el";
    const multiAlign = sel.k === "el" && sel.ids.length >= 2;
    alignBar.classList.toggle("lvis-align--multi", multiAlign);
    const mainTitle = document.getElementById("lvis-align-main-title");
    if (mainTitle)
      mainTitle.textContent = multiAlign ? "互相对齐（参照首个）" : "区内对齐（相对区带）";

    const hz = document.getElementById("lvis-grid-al-h");
    const vz = document.getElementById("lvis-grid-al-v");
    if (hz) hz.setAttribute("aria-label", multiAlign ? "水平互相对齐" : "水平区内对齐");
    if (vz) vz.setAttribute("aria-label", multiAlign ? "垂直互相对齐" : "垂直区内对齐");

    const alAria: [string, string, string][] = [
      ["lvis-al-left", "区内水平靠左", "左缘与首个对齐"],
      ["lvis-al-center-x", "区内水平居中", "水平方向与首个居中对齐"],
      ["lvis-al-right", "区内水平靠右", "右缘与首个对齐"],
      ["lvis-al-top", "区内垂直靠上", "顶边与首个对齐"],
      ["lvis-al-center-y", "区内垂直居中", "垂直方向与首个居中对齐"],
      ["lvis-al-bottom", "区内垂直靠下", "底边与首个对齐"],
    ];
    for (const [id, zoneLab, multiLab] of alAria) {
      document.getElementById(id)?.setAttribute("aria-label", multiAlign ? multiLab : zoneLab);
    }
  }

  document.querySelectorAll<HTMLButtonElement>(".lvis-match-ref-btn").forEach((b) => {
    b.disabled = !(sel.k === "el" && sel.ids.length > 1);
  });
  document.querySelectorAll<HTMLButtonElement>(".lvis-match-zone-btn").forEach((b) => {
    b.disabled = !(sel.k === "el" && sel.ids.length >= 1);
  });

  const set = (id: string, v: string | number) => {
    const n = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (n) n.value = String(v);
  };

  if (sel.k === "global") {
    set("lvis-field-name", draft.name);
    set("lvis-field-page-role", draft.pageRole);
    set("lvis-field-paper", draft.paperKind);
    set("lvis-field-orientation", draft.orientation);
    set("lvis-g-mt", draft.marginTopMm);
    set("lvis-g-mr", draft.marginRightMm);
    set("lvis-g-mb", draft.marginBottomMm);
    set("lvis-g-ml", draft.marginLeftMm);
  }

  if (sel.k === "headerBand" || sel.k === "footerBand") {
    const title = document.getElementById("lvis-band-title");
    if (title) title.textContent = sel.k === "headerBand" ? "页眉带高度（mm）" : "页脚带高度（mm）";
    set("lvis-band-mm", sel.k === "headerBand" ? draft.headerBandMm : draft.footerBandMm);
  }

  if (sel.k === "el") {
    syncElementInputsFromModel();
    const el = findSelEl();
    const dw = document.getElementById("lvis-e-date-wrap");
    const iw = document.getElementById("lvis-e-img-wrap");
    const tw = document.getElementById("lvis-e-text-wrap");
    if (dw) dw.hidden = el?.type !== "date";
    if (iw) iw.hidden = el?.type !== "image";
    if (tw) tw.hidden = el?.type !== "text" && el?.type !== "box";
  }
}
