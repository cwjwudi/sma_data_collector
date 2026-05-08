import {
  createTemplate,
  defaultElement,
  loadTemplates,
  makeElement,
  saveTemplates,
  type NewTemplateOptions,
  type ReportTemplate,
  type TemplateControlType,
  type TemplateElement,
} from "./templates/model";
import {
  blankZonesSnapshot,
  loadLayoutPresets,
  presetZonesSnapshot,
  type LayoutPreset,
} from "./templates/layout-model";
import { computePaperLayout } from "./templates/layout-geometry";
import { renderZoneElementsInto } from "./templates/layout-zone-render";
import { PAPER_LABEL, PAPER_PRESETS, type PaperKind } from "./templates/paper";
import { getLayoutPresetById } from "./report-layout";

export interface TemplatePagesDeps {
  showPage: (id: string) => void;
}

let deps: TemplatePagesDeps;
let templates: ReportTemplate[] = [];
let editing: ReportTemplate | null = null;
let selectedId: string | null = null;

let dragMove: { id: string; startX: number; startY: number; origX: number; origY: number } | null =
  null;

export function initReportTemplates(d: TemplatePagesDeps): void {
  deps = d;
  templates = loadTemplates();

  document.getElementById("btn-new-template")?.addEventListener("click", () => openNewTemplateDialog());

  document.getElementById("btn-template-back")?.addEventListener("click", () => {
    editing = null;
    selectedId = null;
    deps.showPage("templates");
    refreshTemplateList();
  });

  document.getElementById("btn-template-save")?.addEventListener("click", () => {
    if (!editing) return;
    const nameInput = document.getElementById("template-editor-name") as HTMLInputElement | null;
    if (nameInput) editing.name = nameInput.value.trim() || "未命名模版";
    editing.updatedAt = new Date().toISOString();
    editing.elements.forEach(clampElementToContent);
    const idx = templates.findIndex((x) => x.id === editing!.id);
    if (idx >= 0) templates[idx] = { ...editing, elements: editing.elements.map((e) => ({ ...e })) };
    else templates.push({ ...editing });
    saveTemplates(templates);
    renderTemplateList();
    alert("已保存模版（本地）");
  });

  bindNewTemplateDialog();

  const canvas = document.getElementById("template-canvas-root");
  canvas?.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  canvas?.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!editing || !canvas) return;
    const type = (e.dataTransfer?.getData("application/x-rptp-control") ||
      e.dataTransfer?.getData("text/plain")) as TemplateControlType;
    if (type !== "text" && type !== "box") return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left - 20);
    const y = Math.round(e.clientY - rect.top - 16);
    const el = makeElement(type);
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    clampElementToContent(el);
    editing.elements.push(el);
    selectedId = el.id;
    renderCanvas();
    syncPropsPanel();
  });

  canvas?.addEventListener("mousedown", (e) => {
    const t = (e.target as HTMLElement).closest("[data-element-id]");
    if (!t || !canvas.contains(t)) return;
    const id = t.getAttribute("data-element-id");
    if (!id || !editing) return;
    const el = editing.elements.find((x) => x.id === id);
    if (!el) return;
    selectedId = id;
    renderCanvas();
    syncPropsPanel();
    dragMove = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
    };
    e.preventDefault();
  });

  canvas?.addEventListener("click", (e) => {
    if (e.target === canvas) {
      selectedId = null;
      renderCanvas();
      syncPropsPanel();
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragMove || !editing) return;
    const el = editing.elements.find((x) => x.id === dragMove!.id);
    if (!el) return;
    el.x = Math.max(0, dragMove.origX + (e.clientX - dragMove.startX));
    el.y = Math.max(0, dragMove.origY + (e.clientY - dragMove.startY));
    clampElementToContent(el);
    renderCanvas();
    syncPropsPanel();
  });

  window.addEventListener("mouseup", () => {
    dragMove = null;
  });

  document.querySelectorAll<HTMLElement>("[data-template-tool]").forEach((node) => {
    node.addEventListener("dragstart", (e) => {
      const type = node.dataset.templateTool as TemplateControlType;
      e.dataTransfer?.setData("application/x-rptp-control", type);
      e.dataTransfer?.setData("text/plain", type);
      e.dataTransfer!.effectAllowed = "copy";
    });
  });

  bindPropsForm();
  document.getElementById("btn-prop-delete")?.addEventListener("click", () => {
    if (!editing || !selectedId) return;
    editing.elements = editing.elements.filter((x) => x.id !== selectedId);
    selectedId = null;
    renderCanvas();
    syncPropsPanel();
  });

  window.addEventListener("keydown", (e) => {
    const pageEditor = document.getElementById("page-template-editor");
    if (!pageEditor?.classList.contains("is-visible")) return;
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (!selectedId || !editing) return;
    e.preventDefault();
    editing.elements = editing.elements.filter((x) => x.id !== selectedId);
    selectedId = null;
    renderCanvas();
    syncPropsPanel();
  });
}

function clampElementToContent(el: TemplateElement): void {
  if (!editing) return;
  const m = computePaperLayout(editing.paperKind, editing.orientation, editing.layoutSnapshot);
  el.w = Math.max(20, Math.min(el.w, m.contentW));
  el.h = Math.max(20, Math.min(el.h, m.contentH));
  el.x = Math.max(0, Math.min(el.x, m.contentW - el.w));
  el.y = Math.max(0, Math.min(el.y, m.contentH - el.h));
}

function renderPaperChrome(): void {
  const pageEl = document.getElementById("template-canvas-page");
  const root = document.getElementById("template-canvas-root");
  const headerEl = document.getElementById("template-paper-header");
  const footerEl = document.getElementById("template-paper-footer");
  const headerInner = document.getElementById("template-paper-header-inner");
  const footerInner = document.getElementById("template-paper-footer-inner");
  const meta = document.getElementById("template-editor-paper-meta");
  if (!editing || !pageEl || !root) return;

  const m = computePaperLayout(editing.paperKind, editing.orientation, editing.layoutSnapshot);

  pageEl.style.width = `${m.pageW}px`;
  pageEl.style.height = `${m.pageH}px`;

  root.style.left = `${m.contentLeft}px`;
  root.style.top = `${m.contentTop}px`;
  root.style.width = `${m.contentW}px`;
  root.style.height = `${m.contentH}px`;

  if (headerEl && headerInner) {
    const show = m.hb > 1;
    headerEl.hidden = !show;
    headerEl.style.left = `${m.ml}px`;
    headerEl.style.top = `${m.mt}px`;
    headerEl.style.width = `${m.pageW - m.ml - m.mr}px`;
    headerEl.style.height = `${m.hb}px`;
    if (editing.headerElements.length > 0) {
      renderZoneElementsInto(headerInner, editing.headerElements, {
        previewPage: 1,
        selectionChrome: false,
      });
    } else {
      headerInner.replaceChildren();
      headerInner.textContent = editing.headerText.trim() || "（页眉）";
    }
  }

  if (footerEl && footerInner) {
    const show = m.fb > 1;
    footerEl.hidden = !show;
    footerEl.style.left = `${m.ml}px`;
    footerEl.style.width = `${m.pageW - m.ml - m.mr}px`;
    footerEl.style.height = `${m.fb}px`;
    footerEl.style.bottom = `${m.mb}px`;
    if (editing.footerElements.length > 0) {
      renderZoneElementsInto(footerInner, editing.footerElements, {
        previewPage: 1,
        selectionChrome: false,
      });
    } else {
      footerInner.replaceChildren();
      footerInner.textContent = editing.footerText.trim() || "（页脚）";
    }
  }

  if (meta) {
    const orient = editing.orientation === "landscape" ? "横向" : "纵向";
    let src: string;
    if (editing.layoutPresetId === null) {
      src = "空白纸张";
    } else {
      const pref = getLayoutPresetById(editing.layoutPresetId);
      src = pref ? `版式「${pref.name}」` : "版式（预设已删除）";
    }
    const cov =
      editing.coverLayoutPresetId === null
        ? "无"
        : getLayoutPresetById(editing.coverLayoutPresetId)?.name ?? "预设已删";
    const bk =
      editing.backLayoutPresetId === null
        ? "无"
        : getLayoutPresetById(editing.backLayoutPresetId)?.name ?? "预设已删";
    meta.textContent = `${PAPER_LABEL[editing.paperKind]} · ${orient} · ${src} · 正文 ${m.contentW}×${m.contentH} px · 封面 ${cov} · 末页 ${bk}`;
  }
}

function paperMmLine(pk: PaperKind, orientation: "portrait" | "landscape"): string {
  const def = PAPER_PRESETS[pk];
  const mm =
    orientation === "landscape"
      ? `${def.heightMm}×${def.widthMm}`
      : `${def.widthMm}×${def.heightMm}`;
  return `${mm} mm`;
}

function thumbAspect(pk: PaperKind, orientation: "portrait" | "landscape"): string {
  const d = PAPER_PRESETS[pk];
  const w = orientation === "portrait" ? d.widthMm : d.heightMm;
  const h = orientation === "portrait" ? d.heightMm : d.widthMm;
  return `${w} / ${h}`;
}

function selectSingleCard(grid: HTMLElement, btn: HTMLButtonElement): void {
  grid.querySelectorAll(".nt-layout-card").forEach((c) => c.classList.remove("is-selected"));
  btn.classList.add("is-selected");
}

function appendPresetCard(grid: HTMLElement, preset: LayoutPreset): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nt-layout-card";
  btn.dataset.presetId = preset.id;

  const thumb = document.createElement("div");
  thumb.className = "nt-layout-card-preview";
  const sheet = document.createElement("div");
  sheet.className = "nt-sheet-thumb nt-sheet-thumb--zones";
  sheet.style.aspectRatio = thumbAspect(preset.paperKind, preset.orientation);
  sheet.appendChild(document.createElement("div")).className = "nt-sheet-zone nt-sheet-zone-header";
  sheet.appendChild(document.createElement("div")).className = "nt-sheet-zone nt-sheet-zone-content";
  sheet.appendChild(document.createElement("div")).className = "nt-sheet-zone nt-sheet-zone-footer";
  thumb.appendChild(sheet);
  btn.appendChild(thumb);

  const title = document.createElement("div");
  title.className = "nt-layout-card-title";
  title.textContent = preset.name;

  const meta = document.createElement("div");
  meta.className = "nt-layout-card-dim";
  meta.textContent = `${PAPER_LABEL[preset.paperKind]} · ${paperMmLine(preset.paperKind, preset.orientation)}`;

  btn.appendChild(title);
  btn.appendChild(meta);

  btn.addEventListener("click", () => selectSingleCard(grid, btn));
  grid.appendChild(btn);
}

function appendBlankCard(
  grid: HTMLElement,
  paper: PaperKind,
  orientation: "portrait" | "landscape",
): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nt-layout-card nt-layout-card--blank";
  btn.dataset.ntBlank = `${paper}:${orientation}`;

  const thumb = document.createElement("div");
  thumb.className = "nt-layout-card-preview";
  const sheet = document.createElement("div");
  sheet.className = "nt-sheet-thumb nt-sheet-thumb--blank";
  sheet.style.aspectRatio = thumbAspect(paper, orientation);
  thumb.appendChild(sheet);
  btn.appendChild(thumb);

  const title = document.createElement("div");
  title.className = "nt-layout-card-title";
  title.textContent = `${PAPER_LABEL[paper]}（空白）`;

  const meta = document.createElement("div");
  meta.className = "nt-layout-card-dim";
  meta.textContent = paperMmLine(paper, orientation);

  btn.appendChild(title);
  btn.appendChild(meta);

  btn.addEventListener("click", () => selectSingleCard(grid, btn));
  grid.appendChild(btn);
}

function selectedPresetIdFromGrid(grid: HTMLElement | null): string | null {
  if (!grid) return null;
  const sel = grid.querySelector<HTMLButtonElement>(".nt-layout-card.is-selected");
  return sel?.dataset.presetId ?? null;
}

function selectedBlankFromGrid(grid: HTMLElement | null): {
  paper: PaperKind;
  orientation: "portrait" | "landscape";
} | null {
  if (!grid) return null;
  const sel = grid.querySelector<HTMLButtonElement>(".nt-layout-card.is-selected");
  const raw = sel?.dataset.ntBlank;
  if (!raw || !raw.includes(":")) return null;
  const [paper, orientation] = raw.split(":") as [PaperKind, "portrait" | "landscape"];
  if (!paper || (orientation !== "portrait" && orientation !== "landscape")) return null;
  return { paper, orientation };
}

function bindNewTemplateDialog(): void {
  const dlg = document.getElementById("dialog-new-template") as HTMLDialogElement | null;
  const form = document.getElementById("form-new-template") as HTMLFormElement | null;
  const btnCancel = document.getElementById("nt-cancel");
  const bodyPresetGrid = document.getElementById("nt-body-preset-grid");
  const bodyBlankGrid = document.getElementById("nt-body-blank-grid");
  const coverGrid = document.getElementById("nt-cover-grid");
  const backGrid = document.getElementById("nt-back-grid");
  const tabs = document.querySelectorAll<HTMLButtonElement>(".nt-body-tab");

  btnCancel?.addEventListener("click", () => dlg?.close());

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.ntBodyTab as "preset" | "blank" | undefined;
      if (!mode || !bodyPresetGrid || !bodyBlankGrid) return;
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      const presetMode = mode === "preset";
      bodyPresetGrid.hidden = !presetMode;
      bodyBlankGrid.hidden = presetMode;
      if (presetMode) {
        const first = bodyPresetGrid.querySelector<HTMLButtonElement>(".nt-layout-card");
        if (first && !bodyPresetGrid.querySelector(".nt-layout-card.is-selected")) {
          selectSingleCard(bodyPresetGrid, first);
        }
      } else {
        const first = bodyBlankGrid.querySelector<HTMLButtonElement>(".nt-layout-card");
        if (first && !bodyBlankGrid.querySelector(".nt-layout-card.is-selected")) {
          selectSingleCard(bodyBlankGrid, first);
        }
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="nt-cover"]').forEach((r) => {
    r.addEventListener("change", () => {
      const show =
        document.querySelector<HTMLInputElement>('input[name="nt-cover"]:checked')?.value === "preset";
      if (coverGrid) coverGrid.hidden = !show;
      if (!show) {
        coverGrid?.querySelectorAll(".nt-layout-card").forEach((c) => c.classList.remove("is-selected"));
      }
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="nt-back"]').forEach((r) => {
    r.addEventListener("change", () => {
      const show =
        document.querySelector<HTMLInputElement>('input[name="nt-back"]:checked')?.value === "preset";
      if (backGrid) backGrid.hidden = !show;
      if (!show) {
        backGrid?.querySelectorAll(".nt-layout-card").forEach((c) => c.classList.remove("is-selected"));
      }
    });
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!dlg || !bodyPresetGrid || !bodyBlankGrid || !coverGrid || !backGrid) return;

    const nameEl = document.getElementById("nt-name") as HTMLInputElement | null;
    const name = nameEl?.value.trim() || "新建模版";

    let opts: NewTemplateOptions;

    if (!bodyPresetGrid.hidden) {
      const pid = selectedPresetIdFromGrid(bodyPresetGrid);
      if (!pid) {
        alert("请点选一个正文「自定义版式」卡片。");
        return;
      }
      const preset = getLayoutPresetById(pid);
      if (!preset) {
        alert("所选正文版式不存在，请重新选择。");
        return;
      }
      const b = presetZonesSnapshot(preset);
      opts = {
        name,
        paperKind: preset.paperKind,
        orientation: preset.orientation,
        layoutPresetId: preset.id,
        layoutSnapshot: b.layoutSnapshot,
        headerText: b.headerText,
        footerText: b.footerText,
        headerElements: b.headerElements,
        footerElements: b.footerElements,
      };
    } else {
      const bk = selectedBlankFromGrid(bodyBlankGrid);
      if (!bk) {
        alert("请点选一个「空白纸张」规格卡片。");
        return;
      }
      const b = blankZonesSnapshot();
      opts = {
        name,
        paperKind: bk.paper,
        orientation: bk.orientation,
        layoutPresetId: null,
        layoutSnapshot: b.layoutSnapshot,
        headerText: "",
        footerText: "",
        headerElements: [],
        footerElements: [],
      };
    }

    const coverWantPreset =
      document.querySelector<HTMLInputElement>('input[name="nt-cover"]:checked')?.value === "preset";
    const emptyCover = blankZonesSnapshot();
    let coverLayoutPresetId: string | null = null;
    let coverZones = emptyCover;
    if (coverWantPreset) {
      const cid = selectedPresetIdFromGrid(coverGrid);
      if (!cid) {
        alert("已选择「选用封面版式」，请在卡片中点选一个封面版式。");
        return;
      }
      const cp = getLayoutPresetById(cid);
      if (!cp) {
        alert("所选封面版式不存在。");
        return;
      }
      coverLayoutPresetId = cp.id;
      coverZones = presetZonesSnapshot(cp);
    }

    const backWantPreset =
      document.querySelector<HTMLInputElement>('input[name="nt-back"]:checked')?.value === "preset";
    const emptyBack = blankZonesSnapshot();
    let backLayoutPresetId: string | null = null;
    let backZones = emptyBack;
    if (backWantPreset) {
      const bid = selectedPresetIdFromGrid(backGrid);
      if (!bid) {
        alert("已选择「选用末页版式」，请在卡片中点选一个末页版式。");
        return;
      }
      const bp = getLayoutPresetById(bid);
      if (!bp) {
        alert("所选末页版式不存在。");
        return;
      }
      backLayoutPresetId = bp.id;
      backZones = presetZonesSnapshot(bp);
    }

    opts = {
      ...opts,
      coverLayoutPresetId,
      coverLayoutSnapshot: coverZones.layoutSnapshot,
      coverHeaderText: coverZones.headerText,
      coverFooterText: coverZones.footerText,
      coverHeaderElements: coverZones.headerElements,
      coverFooterElements: coverZones.footerElements,
      backLayoutPresetId,
      backLayoutSnapshot: backZones.layoutSnapshot,
      backHeaderText: backZones.headerText,
      backFooterText: backZones.footerText,
      backHeaderElements: backZones.headerElements,
      backFooterElements: backZones.footerElements,
    };

    const t = createTemplate(opts);
    templates.push(t);
    saveTemplates(templates);
    renderTemplateList();
    dlg.close();
    openEditor(t.id);
  });
}

function openNewTemplateDialog(): void {
  const dlg = document.getElementById("dialog-new-template") as HTMLDialogElement | null;
  const nameEl = document.getElementById("nt-name") as HTMLInputElement | null;
  const bodyPresetGrid = document.getElementById("nt-body-preset-grid");
  const bodyBlankGrid = document.getElementById("nt-body-blank-grid");
  const coverGrid = document.getElementById("nt-cover-grid");
  const backGrid = document.getElementById("nt-back-grid");
  const bodyHint = document.getElementById("nt-body-hint");
  const coverEmpty = document.getElementById("nt-cover-empty");
  const backEmpty = document.getElementById("nt-back-empty");
  const tabs = document.querySelectorAll<HTMLButtonElement>(".nt-body-tab");

  if (!dlg || !bodyPresetGrid || !bodyBlankGrid || !coverGrid || !backGrid) return;

  if (nameEl) nameEl.value = "新建模版";

  document.querySelectorAll<HTMLInputElement>('input[name="nt-cover"]').forEach((r) => {
    r.checked = r.value === "none";
  });
  document.querySelectorAll<HTMLInputElement>('input[name="nt-back"]').forEach((r) => {
    r.checked = r.value === "none";
  });
  coverGrid.hidden = true;
  backGrid.hidden = true;

  const presets = loadLayoutPresets();
  const normal = presets.filter((p) => p.pageRole === "normal");
  const covers = presets.filter((p) => p.pageRole === "cover");
  const backs = presets.filter((p) => p.pageRole === "back");

  bodyPresetGrid.replaceChildren();
  bodyBlankGrid.replaceChildren();
  coverGrid.replaceChildren();
  backGrid.replaceChildren();

  if (bodyHint) {
    bodyHint.textContent =
      normal.length === 0
        ? "暂无标记为「正文页」的版式，请使用空白纸张或先到「版式与页眉页脚」新建版式并将页面用途设为正文页。"
        : "点选卡片选择正文：自定义版式（正文页）或切换到「空白纸张」选择纸张与方向。";
  }

  for (const p of normal) {
    appendPresetCard(bodyPresetGrid, p);
  }

  const papers: PaperKind[] = ["A5", "A4", "A3", "Letter"];
  const orients = ["portrait", "landscape"] as const;
  for (const pk of papers) {
    for (const o of orients) {
      appendBlankCard(bodyBlankGrid, pk, o);
    }
  }

  for (const p of covers) {
    appendPresetCard(coverGrid, p);
  }

  for (const p of backs) {
    appendPresetCard(backGrid, p);
  }

  const coverPresetRadio = document.querySelector<HTMLInputElement>('input[name="nt-cover"][value="preset"]');
  const backPresetRadio = document.querySelector<HTMLInputElement>('input[name="nt-back"][value="preset"]');
  if (coverPresetRadio) coverPresetRadio.disabled = covers.length === 0;
  if (backPresetRadio) backPresetRadio.disabled = backs.length === 0;

  if (coverEmpty) {
    coverEmpty.hidden = covers.length > 0;
    coverEmpty.textContent =
      covers.length === 0
        ? "暂无「封面」版式。请到「版式与页眉页脚」新建并将页面用途设为封面。"
        : "";
  }

  if (backEmpty) {
    backEmpty.hidden = backs.length > 0;
    backEmpty.textContent =
      backs.length === 0
        ? "暂无「末页」版式。请到「版式与页眉页脚」新建并将页面用途设为末页。"
        : "";
  }

  const preferBlank = normal.length === 0;
  tabs.forEach((tab) => {
    const mode = tab.dataset.ntBodyTab;
    tab.classList.toggle("is-active", preferBlank ? mode === "blank" : mode === "preset");
  });
  bodyPresetGrid.hidden = preferBlank;
  bodyBlankGrid.hidden = !preferBlank;

  if (!preferBlank && normal.length > 0) {
    const first = bodyPresetGrid.querySelector<HTMLButtonElement>(".nt-layout-card");
    if (first) selectSingleCard(bodyPresetGrid, first);
  } else {
    const firstBlank = bodyBlankGrid.querySelector<HTMLButtonElement>(".nt-layout-card");
    if (firstBlank) selectSingleCard(bodyBlankGrid, firstBlank);
  }

  dlg.showModal();
}

export function refreshTemplateList(): void {
  templates = loadTemplates();
  renderTemplateList();
}

export function showTemplatesPage(): void {
  refreshTemplateList();
  deps.showPage("templates");
}

export function openEditor(templateId: string): void {
  templates = loadTemplates();
  const t = templates.find((x) => x.id === templateId);
  if (!t) return;
  editing = {
    ...t,
    layoutSnapshot: { ...t.layoutSnapshot },
    elements: t.elements.map((raw) => hydrateElement(raw)),
  };
  editing.elements.forEach(clampElementToContent);
  selectedId = null;
  const nameInput = document.getElementById("template-editor-name") as HTMLInputElement | null;
  if (nameInput) nameInput.value = editing.name;
  deps.showPage("templateEditor");
  renderPaperChrome();
  renderCanvas();
  syncPropsPanel();
}

function hydrateElement(raw: TemplateElement): TemplateElement {
  const type: TemplateControlType = raw.type === "box" ? "box" : "text";
  const base = defaultElement(type);
  const id =
    typeof raw.id === "string" && raw.id.length > 0 ? raw.id : makeElement(type).id;
  return {
    ...base,
    ...raw,
    id,
    type,
  };
}

function layoutSourceLabel(t: ReportTemplate): string {
  if (t.layoutPresetId === null) return "空白纸张";
  const preset = getLayoutPresetById(t.layoutPresetId);
  return preset ? `版式「${preset.name}」` : "自定义版式（预设已删）";
}

function renderTemplateList(): void {
  const tbody = document.querySelector("#template-list tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  templates = loadTemplates();
  if (templates.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="6" class="template-table-empty">暂无模版，点击「新建模版」开始。</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const t of templates) {
    const tr = document.createElement("tr");
    const date = t.updatedAt.slice(0, 19).replace("T", " ");
    const orient = t.orientation === "landscape" ? "横" : "竖";
    tr.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td>${PAPER_LABEL[t.paperKind]} · ${orient}</td>
      <td>${escapeHtml(layoutSourceLabel(t))}</td>
      <td>${t.elements.length}</td>
      <td>${date}</td>
      <td class="template-table-actions">
        <button type="button" class="btn btn-sm btn-primary" data-edit="${t.id}">编辑</button>
        <button type="button" class="btn btn-sm" data-del="${t.id}">删除</button>
      </td>`;
    tr.querySelector(`[data-edit="${t.id}"]`)?.addEventListener("click", () => openEditor(t.id));
    tr.querySelector(`[data-del="${t.id}"]`)?.addEventListener("click", () => {
      if (!confirm(`确定删除模版「${t.name}」？`)) return;
      templates = templates.filter((x) => x.id !== t.id);
      saveTemplates(templates);
      renderTemplateList();
    });
    tbody.appendChild(tr);
  }
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderCanvas(): void {
  const canvas = document.getElementById("template-canvas-root");
  if (!canvas || !editing) return;
  canvas.querySelectorAll("[data-element-id]").forEach((n) => n.remove());
  for (const el of editing.elements) {
    const node = document.createElement("div");
    node.className = "template-canvas-node" + (selectedId === el.id ? " is-selected" : "");
    node.dataset.elementId = el.id;
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
    node.style.width = `${el.w}px`;
    node.style.height = `${el.h}px`;
    node.style.color = el.color;
    node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
    node.style.fontSize = `${el.fontSize}px`;
    if (el.type === "text") {
      node.textContent = el.text;
      node.style.display = "flex";
      node.style.alignItems = "center";
      node.style.padding = "4px 8px";
      node.style.overflow = "hidden";
    } else {
      node.style.border = `1px solid ${el.color}33`;
      node.style.borderRadius = "4px";
    }
    canvas.appendChild(node);
  }
}

function bindPropsForm(): void {
  const ids = ["prop-text", "prop-x", "prop-y", "prop-w", "prop-h", "prop-color", "prop-bg", "prop-font"];
  for (const id of ids) {
    document.getElementById(id)?.addEventListener("input", applyPropsFromInputs);
    document.getElementById(id)?.addEventListener("change", applyPropsFromInputs);
  }
}

function applyPropsFromInputs(): void {
  if (!editing || !selectedId) return;
  const el = editing.elements.find((x) => x.id === selectedId);
  if (!el) return;
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value;
  el.text = g("prop-text") ?? el.text;
  el.x = Math.max(0, parseInt(g("prop-x") ?? String(el.x), 10) || 0);
  el.y = Math.max(0, parseInt(g("prop-y") ?? String(el.y), 10) || 0);
  el.w = Math.max(20, parseInt(g("prop-w") ?? String(el.w), 10) || 20);
  el.h = Math.max(20, parseInt(g("prop-h") ?? String(el.h), 10) || 20);
  el.color = g("prop-color") ?? el.color;
  el.bgColor = g("prop-bg") ?? el.bgColor;
  el.fontSize = Math.max(8, parseInt(g("prop-font") ?? String(el.fontSize), 10) || 14);
  clampElementToContent(el);
  renderCanvas();
}

function syncPropsPanel(): void {
  const panel = document.getElementById("template-props-fields");
  const empty = document.getElementById("template-props-empty");
  if (!panel || !empty || !editing) return;
  if (!selectedId) {
    panel.hidden = true;
    empty.hidden = false;
    return;
  }
  const el = editing.elements.find((x) => x.id === selectedId);
  if (!el) {
    selectedId = null;
    panel.hidden = true;
    empty.hidden = false;
    return;
  }
  panel.hidden = false;
  empty.hidden = true;
  const set = (id: string, v: string | number) => {
    const inp = document.getElementById(id) as HTMLInputElement | null;
    if (inp) inp.value = String(v);
  };
  set("prop-text", el.text);
  set("prop-x", el.x);
  set("prop-y", el.y);
  set("prop-w", el.w);
  set("prop-h", el.h);
  const hexColor = /^#[0-9A-Fa-f]{6}$/.test(el.color) ? el.color : "#18181b";
  set("prop-color", hexColor);
  set("prop-bg", el.bgColor);
  set("prop-font", el.fontSize);
}
