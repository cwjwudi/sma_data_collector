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
  | { k: "global" }
  | { k: "headerBand" }
  | { k: "footerBand" }
  | { k: "el"; zone: "header" | "footer"; id: string };

let sel: Sel = { k: "global" };

let dragMove: {
  zone: "header" | "footer";
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
} | null = null;

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

function findSelEl(): LayoutZoneElement | undefined {
  if (!draft || sel.k !== "el") return undefined;
  const list = sel.zone === "header" ? draft.headerElements : draft.footerElements;
  return list.find((x) => x.id === sel.id);
}

export function initReportLayoutVisual(d: LayoutVisualDeps): void {
  deps = d;

  document.getElementById("btn-lvis-back")?.addEventListener("click", () => {
    draft = null;
    sel = { k: "global" };
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

  document.getElementById("lvis-body-zone")?.addEventListener("click", () => {
    sel = { k: "global" };
    renderLvis();
    syncLvisDrawer();
  });

  bindDrawerInputs();

  document.getElementById("btn-lvis-el-delete")?.addEventListener("click", () => {
    if (!draft || sel.k !== "el") return;
    if (sel.zone === "header") draft.headerElements = draft.headerElements.filter((x) => x.id !== sel.id);
    else draft.footerElements = draft.footerElements.filter((x) => x.id !== sel.id);
    sel = { k: sel.zone === "header" ? "headerBand" : "footerBand" };
    renderLvis();
    syncLvisDrawer();
  });

  window.addEventListener("mousemove", onWinMove);
  window.addEventListener("mouseup", () => {
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
    if (zone === "header") draft!.headerElements.push(el);
    else draft!.footerElements.push(el);
    sel = { k: "el", zone, id: el.id };
    renderLvis();
    syncLvisDrawer();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (!draft) return;
    const node = (e.target as HTMLElement).closest("[data-layout-zone-el-id]");
    if (!node || !canvas.contains(node)) return;
    const id = node.getAttribute("data-layout-zone-el-id");
    if (!id) return;
    const list = zone === "header" ? draft.headerElements : draft.footerElements;
    const el = list.find((x) => x.id === id);
    if (!el) return;
    sel = { k: "el", zone, id };
    dragMove = { zone, id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y };
    e.preventDefault();
    renderLvis();
    syncLvisDrawer();
  });

  canvas.addEventListener("click", (e) => {
    if (!draft) return;
    const t = e.target as HTMLElement;
    const node = t.closest("[data-layout-zone-el-id]");
    if (node && canvas.contains(node)) {
      const id = node.getAttribute("data-layout-zone-el-id")!;
      sel = { k: "el", zone, id };
    } else if (t === canvas || t.classList.contains("lvis-zone-canvas")) {
      sel = zone === "header" ? { k: "headerBand" } : { k: "footerBand" };
    }
    renderLvis();
    syncLvisDrawer();
  });
}

function onWinMove(e: MouseEvent): void {
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
  if (!el || !draft) return;
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
  el.dateFormat = g("lvis-e-date-format") ?? el.dateFormat;
  const url = g("lvis-e-img-url");
  if (url !== undefined && el.type === "image") el.imageSrc = url;
  clampZoneElement(el, zoneDims(sel.zone).zw, zoneDims(sel.zone).zh);
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
  sel = { k: "global" };
  deps.showPage("layoutVisual");
  renderLvis();
  syncLvisDrawer();
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

  const headerSel = sel.k === "el" && sel.zone === "header" ? sel.id : null;
  const footerSel = sel.k === "el" && sel.zone === "footer" ? sel.id : null;

  renderZoneElementsInto(hc, draft.headerElements, { selectedId: headerSel, selectionChrome: true });
  renderZoneElementsInto(fc, draft.footerElements, { selectedId: footerSel, selectionChrome: true });

  hw.classList.toggle("lvis-zone-focused", sel.k === "headerBand" || (sel.k === "el" && sel.zone === "header"));
  fw.classList.toggle("lvis-zone-focused", sel.k === "footerBand" || (sel.k === "el" && sel.zone === "footer"));
  bodyZone.classList.toggle("lvis-zone-focused", sel.k === "global");

  if (meta)
    meta.textContent = `${PAPER_LABEL[draft.paperKind]} · ${draft.orientation === "landscape" ? "横向" : "纵向"} · ${draft.name}`;
}

function syncLvisDrawer(): void {
  const pg = document.getElementById("lvis-drawer-global");
  const pb = document.getElementById("lvis-drawer-band");
  const pe = document.getElementById("lvis-drawer-element");
  if (!draft || !pg || !pb || !pe) return;

  pg.hidden = sel.k !== "global";
  pb.hidden = sel.k !== "headerBand" && sel.k !== "footerBand";
  pe.hidden = sel.k !== "el";

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
