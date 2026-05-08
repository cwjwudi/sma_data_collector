import type { LayoutZoneElement } from "./layout-zone-element";
import { formatLayoutDate } from "./layout-zone-element";

export interface RenderZoneOptions {
  selectedId?: string | null;
  /** 多选高亮；若提供则优先于 selectedId */
  selectedIds?: ReadonlySet<string>;
  /** 模版预览用当前页码 */
  previewPage?: number;
  /** 是否绘制选中描边（模版预览传 false） */
  selectionChrome?: boolean;
}

function previewText(el: LayoutZoneElement, previewPage: number): string {
  if (el.type === "pageNumber") return String(previewPage);
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  return el.text;
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
  const idSet =
    opts.selectedIds ??
    (opts.selectedId ? new Set<string>([opts.selectedId]) : null);
  const chrome = opts.selectionChrome !== false;

  for (const el of elements) {
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

    if (el.type === "image") {
      node.style.padding = "2px";
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      if (el.imageSrc) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = el.imageSrc;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        node.appendChild(img);
      } else {
        node.style.border = "1px dashed rgba(0,0,0,0.2)";
        node.style.display = "flex";
        node.style.alignItems = "center";
        node.style.justifyContent = "center";
        node.style.fontSize = "11px";
        node.textContent = "图片";
      }
    } else if (el.type === "box") {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.border = `1px solid ${el.color}40`;
      node.style.borderRadius = "4px";
      node.style.display = "flex";
      node.style.alignItems = "center";
      node.style.justifyContent = "center";
      node.style.padding = "2px 6px";
      node.style.whiteSpace = "pre-wrap";
      node.textContent = el.text || "";
    } else {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.display = "flex";
      node.style.alignItems = "center";
      node.style.padding = "2px 6px";
      node.style.whiteSpace = "nowrap";
      node.textContent = previewText(el, previewPage);
    }

    host.appendChild(node);
  }
}
