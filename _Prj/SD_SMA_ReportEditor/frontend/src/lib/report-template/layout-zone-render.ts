import type { LayoutAlignAxis, LayoutZoneElement } from "./layout-zone-element";
import {
  flexComposeOuterRoot,
  flexJustifyAlignForAxes,
  formatLayoutDate,
  formatPageNumberDisplay,
  normalizeImageCaptionPosition,
  normalizeImageRotationDeg,
  PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
} from "./layout-zone-element";

export interface RenderZoneOptions {
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string>;
  resizeHandlesForIds?: ReadonlySet<string>;
  previewPage?: number;
  previewTotalPages?: number;
  selectionChrome?: boolean;
}

function previewPlainOrDate(el: LayoutZoneElement): string {
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  return el.text;
}

function flexPlaceAxes(el: LayoutZoneElement): { justifyContent: string; alignItems: string } {
  return flexJustifyAlignForAxes(el.alignX, el.alignY);
}

function axisToTextAlign(ax: LayoutAlignAxis): string {
  if (ax === "center") return "center";
  if (ax === "end") return "right";
  return "left";
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

function appendImageGlyph(paintWrap: HTMLElement, el: LayoutZoneElement): void {
  const rot = normalizeImageRotationDeg(el.imageRotationDeg);
  const imgSrc = typeof el.imageSrc === "string" ? el.imageSrc.trim() : "";
  if (!imgSrc) {
    paintWrap.style.border = "1px dashed rgba(0,0,0,0.2)";
    const ph = document.createElement("span");
    ph.style.fontSize = "11px";
    ph.style.color = "inherit";
    ph.textContent = "图片";
    paintWrap.appendChild(ph);
    return;
  }

  const img = document.createElement("img");
  img.alt = "";
  img.src = imgSrc;
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  if (Math.abs(rot) > 0.01) img.style.transform = `rotate(${rot}deg)`;
  paintWrap.appendChild(img);
}

function makeCaptionChip(el: LayoutZoneElement, text: string, capSide: string): HTMLElement {
  const s = document.createElement("span");
  s.style.whiteSpace = "pre-wrap";
  s.style.lineHeight = "1.25";
  s.style.flexShrink = "0";
  s.style.fontSize = `${el.fontSize}px`;
  s.style.color = el.color;

  if (capSide === "top" || capSide === "bottom") {
    s.style.width = "100%";
    s.style.textAlign = axisToTextAlign(el.alignX) as CanvasTextAlign extends string ? string : never;
  }

  if (capSide === "left" || capSide === "right") {
    s.style.maxWidth = "48%";
    s.style.alignSelf = "center";
    s.style.overflow = "hidden";
    s.style.wordBreak = "break-word";
  }

  s.textContent = text;
  return s;
}

function appendImageSubtree(node: HTMLElement, el: LayoutZoneElement): void {
  const capSide = normalizeImageCaptionPosition(el.imageCaptionPosition);
  const capTxt = String(el.text || "").trim();
  const hasCap = Boolean(capTxt.length > 0 && capSide !== "none");
  const rowLay = capSide === "left" || capSide === "right";

  node.style.padding = "2px";
  node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
  node.style.display = "flex";
  node.style.overflow = "hidden";
  node.style.flexDirection = rowLay ? "row" : "column";
  node.style.gap = hasCap ? "4px" : "0";

  const outer = flexComposeOuterRoot(el.alignX, el.alignY, rowLay);
  node.style.justifyContent = outer.justifyContent;
  node.style.alignItems = outer.alignItems;

  const paint = document.createElement("div");
  paint.style.flex = "1";
  paint.style.minWidth = "0";
  paint.style.minHeight = "0";
  paint.style.alignSelf = "stretch";
  paint.style.display = "flex";
  const ij = flexJustifyAlignForAxes(el.alignX, el.alignY);
  paint.style.justifyContent = ij.justifyContent;
  paint.style.alignItems = ij.alignItems;
  paint.style.overflow = "hidden";

  const capChip = hasCap ? makeCaptionChip(el, capTxt, capSide) : null;

  if (capSide === "top" && capChip) node.appendChild(capChip);
  if (capSide === "left" && capChip) node.appendChild(capChip);

  appendImageGlyph(paint, el);
  node.appendChild(paint);

  if (capSide === "right" && capChip) node.appendChild(capChip);
  if (capSide === "bottom" && capChip) node.appendChild(capChip);
}

/** 将页眉/页脚区控件渲染为绝对定位子节点 */
export function renderZoneElementsInto(
  host: HTMLElement,
  elements: LayoutZoneElement[],
  opts: RenderZoneOptions = {},
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

    const flex = flexPlaceAxes(el);

    if (el.type === "image") {
      appendImageSubtree(node, el);
    } else if (el.type === "box") {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.border = `1px solid ${el.color}40`;
      node.style.borderRadius = "4px";
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = "2px 6px";
      node.style.whiteSpace = "pre-wrap";
      node.textContent = el.text || "";
    } else if (el.type === "pageNumber") {
      const mode = el.pageNumberMode ?? "plain";
      node.style.backgroundColor = "transparent";
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = mode === "circle" ? "2px" : "2px 6px";
      node.style.whiteSpace = "nowrap";

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
        node.appendChild(badge);
      } else {
        node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
        node.textContent = formatPageNumberDisplay(mode, previewPage, previewTotal);
      }
    } else {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = "2px 6px";
      node.style.whiteSpace = "nowrap";
      node.textContent = previewPlainOrDate(el);
    }

    if (chrome && resizeSet?.has(el.id)) {
      appendResizeHandles(node, el.id);
    }

    host.appendChild(node);
  }
}
