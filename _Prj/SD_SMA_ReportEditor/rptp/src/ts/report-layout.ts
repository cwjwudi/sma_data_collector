import {
  createEmptyLayoutPreset,
  hydrateLayoutPreset,
  loadLayoutPresets,
  saveLayoutPresets,
  type LayoutPreset,
} from "./templates/layout-model";
import { PAPER_LABEL, type PaperKind } from "./templates/paper";
import { openLayoutVisual } from "./report-layout-visual";

export interface LayoutPageDeps {
  showPage: (id: string) => void;
}

let deps: LayoutPageDeps;
let presets: LayoutPreset[] = [];
let selectedId: string | null = null;

export function initReportLayoutPage(d: LayoutPageDeps): void {
  deps = d;

  document.getElementById("btn-layout-new")?.addEventListener("click", () => {
    presets = loadLayoutPresets();
    const p = createEmptyLayoutPreset();
    presets.push(p);
    saveLayoutPresets(presets);
    selectedId = p.id;
    renderLayoutList();
    syncLayoutForm();
  });

  document.getElementById("btn-layout-save")?.addEventListener("click", () => {
    presets = loadLayoutPresets();
    if (!selectedId) {
      alert("请先点击表格中的某一版式行");
      return;
    }
    const idx = presets.findIndex((x) => x.id === selectedId);
    if (idx < 0) return;
    readLayoutFormInto(presets[idx]);
    presets[idx].updatedAt = new Date().toISOString();
    saveLayoutPresets(presets);
    renderLayoutList();
    alert("版式已保存（本地）");
  });

  document.querySelector("#layout-preset-list tbody")?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const visBtn = t.closest("[data-layout-vis]");
    if (visBtn) {
      const id = visBtn.getAttribute("data-layout-vis");
      if (id) openLayoutVisual(id);
      return;
    }
    const delBtn = t.closest("[data-delete-preset]");
    if (delBtn) {
      const id = delBtn.getAttribute("data-delete-preset");
      if (id) deletePresetRow(id);
      return;
    }
    const row = t.closest("tr[data-preset-id]");
    if (!row) return;
    const id = row.getAttribute("data-preset-id");
    if (!id) return;
    selectedId = id;
    renderLayoutList();
    syncLayoutForm();
  });
}

function deletePresetRow(id: string): void {
  presets = loadLayoutPresets();
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`删除版式「${p.name}」？引用它的模版保留各自快照不受影响。`)) return;
  presets = presets.filter((x) => x.id !== id);
  saveLayoutPresets(presets);
  if (selectedId === id) selectedId = null;
  renderLayoutList();
  syncLayoutForm();
}

export function showLayoutPage(): void {
  presets = loadLayoutPresets();
  if (selectedId !== null && !presets.some((x) => x.id === selectedId)) {
    selectedId = null;
  }
  renderLayoutList();
  syncLayoutForm();
  deps.showPage("layout");
}

export function refreshLayoutPresetDropdown(select: HTMLSelectElement): void {
  presets = loadLayoutPresets();
  select.innerHTML = "";
  if (presets.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "暂无版式，请到「版式与页眉页脚」新建";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} · ${PAPER_LABEL[p.paperKind]} · ${p.orientation === "landscape" ? "横" : "竖"}`;
    select.appendChild(opt);
  }
}

export function getLayoutPresetById(id: string): LayoutPreset | undefined {
  return loadLayoutPresets().find((x) => x.id === id);
}

function renderLayoutList(): void {
  const tbody = document.querySelector("#layout-preset-list tbody");
  if (!tbody) return;
  presets = loadLayoutPresets();
  tbody.innerHTML = "";
  if (presets.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="4" class="template-table-empty">暂无版式。点击顶栏「新建版式」，再在右侧参数栏填写并保存后，即可在「新建模版」中优先选用。</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const p of presets) {
    const tr = document.createElement("tr");
    const active = p.id === selectedId ? " is-active-row" : "";
    const date = p.updatedAt.slice(0, 19).replace("T", " ");
    tr.className = "layout-preset-row" + active;
    tr.dataset.presetId = p.id;
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>${PAPER_LABEL[p.paperKind]}</td>
      <td>${date}</td>
      <td class="template-table-actions">
        <button type="button" class="btn btn-sm btn-primary" data-layout-vis="${p.id}">可视化编辑</button>
        <button type="button" class="btn btn-sm btn-danger-outline" data-delete-preset="${p.id}">删除</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function syncLayoutForm(): void {
  const form = document.getElementById("layout-edit-panel");
  if (!form) return;
  const emptyHint = document.getElementById("layout-edit-empty");
  presets = loadLayoutPresets();
  const preset =
    selectedId !== null ? presets.find((x) => x.id === selectedId) : undefined;
  if (!preset) {
    form.hidden = true;
    if (emptyHint) emptyHint.hidden = false;
    return;
  }
  form.hidden = false;
  if (emptyHint) emptyHint.hidden = true;

  const p = hydrateLayoutPreset(preset);

  setVal("layout-field-name", p.name);
  setVal("layout-field-paper", p.paperKind);
  setVal("layout-field-orientation", p.orientation);
  setNum("layout-mt", p.marginTopMm);
  setNum("layout-mr", p.marginRightMm);
  setNum("layout-mb", p.marginBottomMm);
  setNum("layout-ml", p.marginLeftMm);
  setNum("layout-hband", p.headerBandMm);
  setNum("layout-fband", p.footerBandMm);
}

function setVal(id: string, v: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (el) el.value = v;
}

function setNum(id: string, v: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = String(v);
}

function readLayoutFormInto(target: LayoutPreset): void {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value;
  const gn = (id: string, fb: number) => Math.max(0, parseFloat(g(id) ?? String(fb)) || fb);
  target.name = (g("layout-field-name") ?? "").trim() || target.name;
  target.paperKind = (g("layout-field-paper") as PaperKind) || target.paperKind;
  target.orientation = g("layout-field-orientation") === "landscape" ? "landscape" : "portrait";
  target.marginTopMm = gn("layout-mt", target.marginTopMm);
  target.marginRightMm = gn("layout-mr", target.marginRightMm);
  target.marginBottomMm = gn("layout-mb", target.marginBottomMm);
  target.marginLeftMm = gn("layout-ml", target.marginLeftMm);
  target.headerBandMm = gn("layout-hband", target.headerBandMm);
  target.footerBandMm = gn("layout-fband", target.footerBandMm);
}
