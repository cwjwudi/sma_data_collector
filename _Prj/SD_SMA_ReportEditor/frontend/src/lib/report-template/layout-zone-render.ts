import type { LayoutAlignAxis, LayoutZoneElement, LayoutZoneTableCell } from "./layout-zone-element";
import {
  ensureZoneTableGrid,
  flexComposeOuterRoot,
  flexJustifyAlignForAxes,
  formatLayoutDate,
  formatPageNumberDisplay,
  getZoneTextWrapStyle,
  normalizeZIndex,
  normalizeImageCaptionPosition,
  normalizeImageRotationDeg,
  PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
  previewZoneElementDisplay,
  zoneTableColumnInnerWidthsPx,
  zoneTableInnerBackgroundCss,
  resolveTableCellBackgroundCss,
  zoneTableNodeShellBackgroundCss,
} from "./layout-zone-element";
import { clampTableRowHeightPx } from "./table-cell-metrics";

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

function truncateZonePreview(s: string, n: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= n ? x : `${x.slice(0, n)}…`;
}

function formatZoneTableCellPreview(cell: LayoutZoneTableCell): string {
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${truncateZonePreview(id, 48)}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${truncateZonePreview(q, 36)}` : "⟨SQL⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function flexPlaceAxes(el: LayoutZoneElement): { justifyContent: string; alignItems: string } {
  return flexJustifyAlignForAxes(el.alignX, el.alignY);
}

/** 文本 / 色块 / 日期：自动换行与长串断行 */
function applyZoneTextWrapStyles(node: HTMLElement, el: LayoutZoneElement) {
  const st = getZoneTextWrapStyle(el);
  if (!st) return;
  Object.assign(node.style, st);
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
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  if (ff) s.style.fontFamily = ff;

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
    const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
    if (ff) node.style.fontFamily = ff;
    node.style.overflow = "hidden";
    node.style.zIndex = String(normalizeZIndex(el.zIndex));

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
      applyZoneTextWrapStyles(node, el);
      node.textContent = el.text || "";
    } else if (el.type === "parameter") {
      node.style.backgroundColor = el.bgColor === "transparent" ? "transparent" : el.bgColor;
      node.style.display = "flex";
      node.style.justifyContent = flex.justifyContent;
      node.style.alignItems = flex.alignItems;
      node.style.padding = "2px 6px";
      applyZoneTextWrapStyles(node, el);
      node.textContent = previewZoneElementDisplay(el, previewPage, previewTotal);
    } else if (el.type === "table") {
      ensureZoneTableGrid(el);
      node.style.backgroundColor = zoneTableNodeShellBackgroundCss();
      node.style.display = "flex";
      node.style.flexDirection = "column";
      /** 较默认底侧多 1px，避免表格最后一行底边框被 overflow:hidden 裁掉 */
      node.style.padding = "2px 2px 3px 2px";
      node.style.overflow = "hidden";
      const tbl = document.createElement("table");
      tbl.style.width = "100%";
      tbl.style.height = "auto";
      tbl.style.maxHeight = "100%";
      tbl.style.borderCollapse = "separate";
      tbl.style.borderSpacing = "0";
      tbl.style.tableLayout = "fixed";
      tbl.style.background = zoneTableInnerBackgroundCss(el.bgColor);
      const colWidths = zoneTableColumnInnerWidthsPx(el);
      const cg = document.createElement("colgroup");
      for (const cw of colWidths) {
        const colEl = document.createElement("col");
        colEl.style.width = `${cw}px`;
        cg.appendChild(colEl);
      }
      tbl.appendChild(cg);
      const tb = document.createElement("tbody");
      const grid = el.tableCells ?? [];
      const rowCount = grid.length;
      for (let ri = 0; ri < rowCount; ri++) {
        const tr = document.createElement("tr");
        tr.style.height = `${clampTableRowHeightPx(el.tableRowHeightPx)}px`;
        const row = grid[ri] ?? [];
        const colCount = row.length;
        for (let ci = 0; ci < colCount; ci++) {
          const td = document.createElement("td");
          const edge = "1px solid rgb(212 212 216)";
          td.style.borderTop = edge;
          td.style.borderLeft = edge;
          if (ci === colCount - 1) td.style.borderRight = edge;
          if (ri === rowCount - 1) td.style.borderBottom = edge;
          td.style.padding = "2px 4px";
          td.style.boxSizing = "border-box";
          td.style.height = "inherit";
          td.style.textAlign = axisToTextAlign(el.alignX);
          td.style.verticalAlign =
            el.alignY === "start" ? "top" : el.alignY === "end" ? "bottom" : "middle";
          td.style.overflow = "hidden";
          td.style.fontSize = "max(10px, 0.85em)";
          td.style.lineHeight = "1.25";
          td.style.backgroundColor = resolveTableCellBackgroundCss(
            { tableBgColor: el.bgColor, tableColBgColors: el.tableColBgColors },
            ci,
            row[ci],
          );
          td.textContent = formatZoneTableCellPreview(row[ci]);
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      node.appendChild(tbl);
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
        if (ff) badge.style.fontFamily = ff;
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
