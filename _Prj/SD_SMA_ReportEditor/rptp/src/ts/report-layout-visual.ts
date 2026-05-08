import { computePaperLayout, type PaperLayoutMetrics } from "./templates/layout-geometry";
import {
  hydrateLayoutPreset,
  loadLayoutPresets,
  saveLayoutPresets,
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
  corner: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
} | null = null;

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

function applyResizeFromCorner(
  el: LayoutZoneElement,
  corner: string,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  dx: number,
  dy: number,
): void {
  const MIN = 16;
  let x = ox;
  let y = oy;
  let w = ow;
  let h = oh;
  if (corner.includes("e")) w = ow + dx;
  if (corner.includes("w")) {
    x = ox + dx;
    w = ow - dx;
  }
  if (corner.includes("s")) h = oh + dy;
  if (corner.includes("n")) {
    y = oy + dy;
    h = oh - dy;
  }
  if (w < MIN) {
    if (corner.includes("w")) x = ox + ow - MIN;
    w = MIN;
  }
  if (h < MIN) {
    if (corner.includes("n")) y = oy + oh - MIN;
    h = MIN;
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

function applyLvisZoom(): void {
  const wrap = document.getElementById("lvis-page-scale-wrap");
  const pct = document.getElementById("lvis-zoom-pct");
  const range = document.getElementById("lvis-zoom-range") as HTMLInputElement | null;
  if (wrap) {
    wrap.style.transform = `scale(${lvisZoom})`;
    wrap.style.transformOrigin = "top center";
  }
  const p = Math.round(lvisZoom * 100);
  if (pct) pct.textContent = `${p}%`;
  if (range) range.value = String(p);
}

function lvisZoomFit(): void {
  const scroll = document.querySelector(".lvis-scroll-pad") as HTMLElement | null;
  const page = document.getElementById("lvis-page");
  if (!scroll || !page) return;
  const pad = 16;
  const mw = Math.max(80, scroll.clientWidth - pad * 2);
  const w = page.offsetWidth;
  if (w <= 0) return;
  lvisZoom = Math.min(2, Math.max(0.35, mw / w));
  applyLvisZoom();
}

function alignSelection(mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom"): void {
  if (!draft || sel.k !== "el") return;
  const z = sel.zone;
  const { zw, zh } = zoneDims(z);
  const list = listForZone(z);
  for (const id of sel.ids) {
    const el = list.find((x) => x.id === id);
    if (!el) continue;
    if (mode === "left") el.x = 0;
    else if (mode === "centerX") el.x = Math.max(0, Math.round((zw - el.w) / 2));
    else if (mode === "right") el.x = Math.max(0, zw - el.w);
    else if (mode === "top") el.y = 0;
    else if (mode === "centerY") el.y = Math.max(0, Math.round((zh - el.h) / 2));
    else if (mode === "bottom") el.y = Math.max(0, zh - el.h);
    snapElInZone(el, z);
  }
  renderLvis();
  syncElementInputsFromModel();
}

function stretchPrimary(fill: "width" | "height" | "both"): void {
  const el = findSelEl();
  if (!draft || sel.k !== "el" || !el) return;
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

export function initReportLayoutVisual(d: LayoutVisualDeps): void {
  deps = d;

  document.getElementById("btn-lvis-back")?.addEventListener("click", () => {
    draft = null;
    sel = { k: "idle" };
    deps.showPage("layout");
  });

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

  document.getElementById("btn-lvis-zoom-out")?.addEventListener("click", () => {
    lvisZoom = Math.max(0.35, Math.round((lvisZoom - 0.1) * 100) / 100);
    applyLvisZoom();
  });
  document.getElementById("btn-lvis-zoom-in")?.addEventListener("click", () => {
    lvisZoom = Math.min(2, Math.round((lvisZoom + 0.1) * 100) / 100);
    applyLvisZoom();
  });
  document.getElementById("lvis-zoom-range")?.addEventListener("input", () => {
    const r = document.getElementById("lvis-zoom-range") as HTMLInputElement | null;
    if (!r) return;
    const p = Number(r.value);
    if (!Number.isFinite(p)) return;
    lvisZoom = Math.min(2, Math.max(0.35, p / 100));
    applyLvisZoom();
  });
  document.getElementById("btn-lvis-zoom-fit")?.addEventListener("click", () => {
    lvisZoomFit();
  });

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

  bindDrawerInputs();

  document.getElementById("btn-lvis-el-delete")?.addEventListener("click", () => {
    if (!draft || sel.k !== "el") return;
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
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    if (sel.k !== "el" || !draft) return;
    e.preventDefault();
    document.getElementById("btn-lvis-el-delete")?.dispatchEvent(new Event("click"));
  });

  window.addEventListener("resize", () => {
    const p = document.getElementById("page-layout-visual");
    if (p?.classList.contains("is-visible")) applyLvisZoom();
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
    const rh = (e.target as HTMLElement).closest("[data-layout-resize-corner]");
    if (rh && canvas.contains(rh)) {
      const corner = rh.getAttribute("data-layout-resize-corner");
      const wrap = rh.closest("[data-layout-zone-el-id]");
      const rid = wrap?.getAttribute("data-layout-zone-el-id");
      if (!corner || !rid) return;
      const list = zone === "header" ? draft.headerElements : draft.footerElements;
      const el = list.find((x) => x.id === rid);
      if (!el) return;
      sel = { k: "el", zone, ids: [rid] };
      resizeDrag = {
        zone,
        id: rid,
        corner,
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
    if (t.closest("[data-layout-resize-corner]")) return;
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
    applyResizeFromCorner(
      el,
      resizeDrag.corner,
      resizeDrag.ox,
      resizeDrag.oy,
      resizeDrag.ow,
      resizeDrag.oh,
      dx,
      dy,
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

function bindDrawerInputs(): void {
  const onChange = () => {
    applyDrawerToDraft();
    syncElementInputsFromModel();
  };
  const ids = [
    "lvis-field-name",
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
}

export function openLayoutVisual(presetId: string): void {
  const list = loadLayoutPresets();
  const p = list.find((x) => x.id === presetId);
  if (!p) return;
  draft = hydrateLayoutPreset(JSON.parse(JSON.stringify(p)) as Partial<LayoutPreset>);
  draft.headerElements = draft.headerElements.map((x) => ({ ...x }));
  draft.footerElements = draft.footerElements.map((x) => ({ ...x }));
  sel = { k: "idle" };
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
    meta.textContent = `${PAPER_LABEL[draft.paperKind]} · ${draft.orientation === "landscape" ? "横向" : "纵向"} · ${draft.name}`;
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
      multi.textContent = `已选 ${sel.ids.length} 个控件；下方属性仅编辑首个选中项；可用「同宽/同高」统一其余项与参照项一致。`;
    }
  }
  if (alignBar) alignBar.hidden = sel.k !== "el";

  document.querySelectorAll<HTMLButtonElement>(".lvis-match-btn").forEach((b) => {
    b.disabled = !(sel.k === "el" && sel.ids.length > 1);
  });

  const set = (id: string, v: string | number) => {
    const n = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (n) n.value = String(v);
  };

  if (sel.k === "global") {
    set("lvis-field-name", draft.name);
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
