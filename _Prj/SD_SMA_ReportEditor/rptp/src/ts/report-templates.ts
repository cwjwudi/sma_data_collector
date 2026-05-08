import {
  createTemplate,
  defaultElement,
  loadTemplates,
  makeElement,
  saveTemplates,
  type ReportTemplate,
  type TemplateControlType,
  type TemplateElement,
} from "./templates/model";

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

  document.getElementById("btn-new-template")?.addEventListener("click", () => {
    const name = window.prompt("新建模版名称", "新建模版");
    if (name === null) return;
    const t = createTemplate(name);
    templates.push(t);
    saveTemplates(templates);
    renderTemplateList();
    openEditor(t.id);
  });

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
    const idx = templates.findIndex((x) => x.id === editing!.id);
    if (idx >= 0) templates[idx] = { ...editing, elements: editing.elements.map((e) => ({ ...e })) };
    else templates.push({ ...editing });
    saveTemplates(templates);
    renderTemplateList();
    alert("已保存模版（本地）");
  });

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
    elements: t.elements.map((raw) => hydrateElement(raw)),
  };
  selectedId = null;
  const nameInput = document.getElementById("template-editor-name") as HTMLInputElement | null;
  if (nameInput) nameInput.value = editing.name;
  deps.showPage("templateEditor");
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

function renderTemplateList(): void {
  const tbody = document.querySelector("#template-list tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  templates = loadTemplates();
  if (templates.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="4" class="template-table-empty">暂无模版，点击「新建模版」开始。</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const t of templates) {
    const tr = document.createElement("tr");
    const date = t.updatedAt.slice(0, 19).replace("T", " ");
    tr.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
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
