import type { LayoutAlignAxis, LayoutZoneElement } from "./layout-zone-element";
import {
  formatLayoutDate,
  formatPageNumberDisplay,
  getZoneTextWrapStyle,
  normalizeZIndex,
  PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
} from "./layout-zone-element";

export interface RenderZoneOptions {
  selectedId?: string | null;
  /** 多选高亮；若提供则优先于 selectedId */
  selectedIds?: ReadonlySet<string>;
  /** 为这些 id 绘制四角缩放手柄（通常仅单选时传入） */
  resizeHandlesForIds?: ReadonlySet<string>;
  /** 模版预览用当前页码 */
  previewPage?: number;
  /** 预览占位总页数（导出时应使用真实分页总数） */
  previewTotalPages?: number;
  /** 是否绘制选中描边（模版预览传 false） */
  selectionChrome?: boolean;
}

function previewPlainOrDate(el: LayoutZoneElement): string {
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  return el.text;
}

function flexPlaceContent(el: LayoutZoneElement): { justifyContent: string; alignItems: string } {
  const j =
    el.alignX === "center" ? "center" : el.alignX === "end" ? "flex-end" : "flex-start";
  const a =
    el.alignY === "center" ? "center" : el.alignY === "end" ? "flex-end" : "flex-start";
  return { justifyContent: j, alignItems: a };
}

function applyZoneTextWrapStyles(node: HTMLElement, el: LayoutZoneElement) {
  const st = getZoneTextWrapStyle(el);
  if (!st) return;
  Object.assign(node.style, st);
}

function appendResizeHandles(node: HTMLElement, elId: string): void {
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
  const label: Record<(typeof handles)[number], string> = {
    nw: "左上角缩放",
    n: "上边缩放",
    ne: "右上角缩放",
    e: "右边缩放",
    se: "右下角缩放",
    s: "下边缩放",
    sw: "左下角缩放",
    w: "左边缩放",
  };
  for (const h of handles) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `layout-zone-resize layout-zone-resize-${h}`;
    btn.dataset.layoutResizeHandle = h;
    btn.dataset.layoutZoneElId = elId;
    btn.tabIndex = -1;
    btn.title = "拖拽调整大小；按住 Shift 保持宽高比";
    btn.setAttribute("aria-label", label[h]);
    node.appendChild(btn);
  }
}

/** 将页眉/页脚区控件渲染为绝对定位子节点 */
export function renderZoneElementsInto(
  host: HTMLElement,
  elements: LayoutZoneElement[],
  opts: RenderZoneOptions = {}
): void {
  host.replaceChildren();
  host.style.position = "relative";
  host.style.width = "100%";
  host.style.height = "100%";
  host.style.overflow = "hidden";
  host.style.boxSizing = "border-box";

  const previewPage = opts.previewPage ?? 1;
  const previewTotal = Math.max(
    1,
    previewPage,
    opts.previewTotalPages ?? PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
  );
  const idSet =
    opts.selectedIds ??
    (opts.selectedId ? new Set<string>([opts.selectedId]) : null);
  const resizeSet = opts.resizeHandlesForIds ?? null;
  const chrome = opts.selectionChrome !== false;

  const sorted = [...elements].sort((a, b) => {
    const za = normalizeZIndex(a.zIndex);
    const zb = normalizeZIndex(b.zIndex);
    if (za !== zb) return za - zb;
    return String(a.id).localeCompare(String(b.id));
  });

  for (const el of sorted) {
    const node = document.createElement("div");
    node.className = "layout-zone-node";
    if (chrome && idSet?.has(el.id)) node.classList.add("is-selected");
    node.dataset.layoutZoneElId = el.id;
    node.style.position = "absolute";
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
    node.style.width = `${el.w}px`;
    node.style.height = `${el.h}px`;
    node.style.boxSizing = "border-box";
    node.style.color = el.color;
    node.style.fontSize = `${el.fontSize}px`;
    node.style.overflow = "hidden";
    node.style.zIndex = String(normalizeZIndex(el.zIndex));

    const flex = flexPlaceContent(el);

    if (el.type === "image") {
      node.style.padding = "2px";
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      if (el.imageSrc) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = el.imageSrc;
        img.style.objectFit = "contain";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.width = "auto";
        img.style.height = "auto";
        node.appendChild(img);
      } else {
        node.style.border = "1px dashed rgba(0,0,0,0.2)";
        node.style.fontSize = "11px";
        const ph = document.createElement("span");
        ph.textContent = "图片";
        node.appendChild(ph);
      }
    } else if (el.type === "box") {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.border = `1px solid ${el.color}40`;
      node.style.borderRadius = "4px";
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = "2px 6px";
      applyZoneTextWrapStyles(node, el);
      node.textContent = el.text || "";
    } else if (el.type === "pageNumber") {
      const mode = el.pageNumberMode ?? "plain";
      node.style.backgroundColor = "transparent";
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = mode === "circle" ? "2px" : "2px 6px";
      node.style.whiteSpace = "nowrap";

      const fill = document.createElement("div");
      fill.className = "layout-zone-page-fill";
      fill.style.flex = "1";
      fill.style.minWidth = "0";
      fill.style.minHeight = "0";
      fill.style.width = "100%";
      fill.style.height = "100%";
      fill.style.display = "flex";
      fill.style.alignItems = flex.alignItems;
      fill.style.justifyContent = flex.justifyContent;
      fill.style.boxSizing = "border-box";

      if (mode === "circle") {
        const badge = document.createElement("span");
        badge.className = "layout-zone-page-circle";
        badge.textContent = formatPageNumberDisplay(mode, previewPage, previewTotal);
        badge.style.boxSizing = "border-box";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.width = "min(100%, 2.75em)";
        badge.style.height = "min(100%, 2.75em)";
        badge.style.aspectRatio = "1";
        badge.style.borderRadius = "50%";
        badge.style.border = `1.5px solid ${el.color}`;
        badge.style.color = el.color;
        badge.style.backgroundColor =
          el.bgColor !== "transparent" ? el.bgColor : "transparent";
        badge.style.fontSize = `${el.fontSize}px`;
        badge.style.lineHeight = "1";
        fill.appendChild(badge);
      } else {
        fill.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
        fill.textContent = formatPageNumberDisplay(mode, previewPage, previewTotal);
      }
      node.appendChild(fill);
    } else {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = "2px 6px";
      applyZoneTextWrapStyles(node, el);
      node.textContent = previewPlainOrDate(el);
    }

    if (chrome && resizeSet?.has(el.id)) {
      appendResizeHandles(node, el.id);
    }

    host.appendChild(node);
  }
}
