import {
  createEmptyLayoutPreset,
  hydrateLayoutPreset,
  isLayoutPresetNameTaken,
  loadLayoutPresets,
  normalizeLayoutPresetName,
  saveLayoutPresets,
  LAYOUT_PAGE_ROLE_LABEL,
  type LayoutPreset,
} from "./templates/layout-model";
import { PAPER_KIND_SHORT, type PaperKind } from "./templates/paper";
import {
  bindHiddenBackedChoiceButtons,
  syncAllChoiceButtonsFromHiddens,
} from "./layout-choice-controls";
import { openLayoutVisual } from "./report-layout-visual";

export interface LayoutPageDeps {
  showPage: (id: string) => void;
}

let deps: LayoutPageDeps;
let presets: LayoutPreset[] = [];
let selectedId: string | null = null;

export function initReportLayoutPage(d: LayoutPageDeps): void {
  deps = d;

  bindHiddenBackedChoiceButtons(document.getElementById("layout-edit-panel"));
  bindNewLayoutDialog();

  document.getElementById("btn-layout-new")?.addEventListener("click", () => {
    openNewLayoutDialog();
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
    const nextName = normalizeLayoutPresetName(presets[idx].name);
    if (!nextName) {
      alert("名称不能为空。");
      syncLayoutForm();
      return;
    }
    if (isLayoutPresetNameTaken(presets, nextName, presets[idx].id)) {
      alert("已有同名版式，请更换名称。");
      syncLayoutForm();
      return;
    }
    presets[idx].name = nextName;
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

function suggestNewLayoutName(p: LayoutPreset): string {
  const paper = PAPER_KIND_SHORT[p.paperKind];
  const ori = p.orientation === "landscape" ? "横向" : "纵向";
  const tag = LAYOUT_PAGE_ROLE_LABEL[p.pageRole];
  return `${paper} ${ori} · ${tag}`;
}

/** 自动命名与已有版式冲突时追加 「（2）」等后缀 */
function allocateUniqueAutoPresetName(list: LayoutPreset[], base: string): string {
  const root = normalizeLayoutPresetName(base) || "新建版式";
  if (!isLayoutPresetNameTaken(list, root)) return root;
  let i = 2;
  while (isLayoutPresetNameTaken(list, `${root} （${i}）`)) i += 1;
  return `${root} （${i}）`;
}

function resetNewLayoutDialog(): void {
  const form = document.getElementById("form-new-layout");
  const nameEl = document.getElementById("nl-layout-name") as HTMLInputElement | null;
  const role = document.getElementById("nl-field-page-role") as HTMLInputElement | null;
  const paper = document.getElementById("nl-field-paper") as HTMLInputElement | null;
  const orient = document.getElementById("nl-field-orientation") as HTMLInputElement | null;
  if (!form || !role || !paper || !orient) return;
  if (nameEl) nameEl.value = "";
  role.value = "normal";
  paper.value = "A4";
  orient.value = "portrait";
  syncAllChoiceButtonsFromHiddens(form);
}

function openNewLayoutDialog(): void {
  resetNewLayoutDialog();
  const dlg = document.getElementById("dialog-new-layout") as HTMLDialogElement | null;
  dlg?.showModal();
}

function submitNewLayoutFromDialog(): boolean {
  const roleEl = document.getElementById("nl-field-page-role") as HTMLInputElement | null;
  const paperEl = document.getElementById("nl-field-paper") as HTMLInputElement | null;
  const orientEl = document.getElementById("nl-field-orientation") as HTMLInputElement | null;
  const nameEl = document.getElementById("nl-layout-name") as HTMLInputElement | null;
  if (!roleEl || !paperEl || !orientEl) return false;
  const pkRaw = paperEl.value;
  const paperKind: PaperKind =
    pkRaw === "A5" || pkRaw === "A4" || pkRaw === "A3" || pkRaw === "Letter" ? pkRaw : "A4";
  const pr = roleEl.value;
  const pageRole = pr === "cover" || pr === "back" ? pr : "normal";
  const orientation = orientEl.value === "landscape" ? "landscape" : "portrait";

  presets = loadLayoutPresets();
  const p = createEmptyLayoutPreset();
  p.paperKind = paperKind;
  p.orientation = orientation;
  p.pageRole = pageRole;
  const customName = normalizeLayoutPresetName(nameEl?.value ?? "");
  if (customName) {
    if (isLayoutPresetNameTaken(presets, customName)) {
      alert("已有同名版式，请更换名称。");
      return false;
    }
    p.name = customName;
  } else {
    p.name = allocateUniqueAutoPresetName(presets, suggestNewLayoutName(p));
  }
  presets.push(p);
  saveLayoutPresets(presets);
  selectedId = p.id;
  renderLayoutList();
  syncLayoutForm();
  return true;
}

function bindNewLayoutDialog(): void {
  const dlg = document.getElementById("dialog-new-layout") as HTMLDialogElement | null;
  const form = document.getElementById("form-new-layout");
  if (!dlg || !form) return;
  bindHiddenBackedChoiceButtons(form);
  document.getElementById("nl-cancel")?.addEventListener("click", () => dlg.close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (submitNewLayoutFromDialog()) dlg.close();
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
    const tag =
      p.pageRole === "cover" ? "「封面」" : p.pageRole === "back" ? "「末页」" : "";
    opt.textContent = `${tag}${p.name} · ${PAPER_KIND_SHORT[p.paperKind]} · ${p.orientation === "landscape" ? "横" : "竖"}`;
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
      '<td colspan="4" class="template-table-empty">暂无版式。点击顶栏「新建版式」在弹出框中选择用途、纸张与方向；随后在右侧参数栏可继续微调并保存，即可在「新建模版」中选用。</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const p of presets) {
    const tr = document.createElement("tr");
    const active = p.id === selectedId ? " is-active-row" : "";
    tr.className = "layout-preset-row" + active;
    tr.dataset.presetId = p.id;
    const paperShort = PAPER_KIND_SHORT[p.paperKind];
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(LAYOUT_PAGE_ROLE_LABEL[p.pageRole] ?? "正文页")}</td>
      <td>${paperShort}</td>
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
  setVal("layout-field-page-role", p.pageRole);
  setVal("layout-field-paper", p.paperKind);
  setVal("layout-field-orientation", p.orientation);
  setNum("layout-mt", p.marginTopMm);
  setNum("layout-mr", p.marginRightMm);
  setNum("layout-mb", p.marginBottomMm);
  setNum("layout-ml", p.marginLeftMm);
  setNum("layout-hband", p.headerBandMm);
  setNum("layout-fband", p.footerBandMm);
  syncAllChoiceButtonsFromHiddens(form);
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
  target.name = normalizeLayoutPresetName(g("layout-field-name") ?? "") || target.name;
  target.paperKind = (g("layout-field-paper") as PaperKind) || target.paperKind;
  target.orientation = g("layout-field-orientation") === "landscape" ? "landscape" : "portrait";
  {
    const pr = g("layout-field-page-role");
    target.pageRole = pr === "cover" || pr === "back" ? pr : "normal";
  }
  target.marginTopMm = gn("layout-mt", target.marginTopMm);
  target.marginRightMm = gn("layout-mr", target.marginRightMm);
  target.marginBottomMm = gn("layout-mb", target.marginBottomMm);
  target.marginLeftMm = gn("layout-ml", target.marginLeftMm);
  target.headerBandMm = gn("layout-hband", target.headerBandMm);
  target.footerBandMm = gn("layout-fband", target.footerBandMm);
}
