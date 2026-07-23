/**
 * D21c：Chromium printToPDF 下格级 CSS border / box-shadow 会子像素错位成断点。
 * 导出前按单元格矩形收集唯一 x/y，用单张 canvas 位图画整表连续格线（一次 stroke，交叉不断）。
 */

export const MINI_PRINT_GRID_ATTR = "data-mini-print-grid";
export const MINI_PRINT_GRID_COLOR = "rgb(212, 212, 216)";

export type DomRectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function collectPrintTableGridAxes(
  wrapRect: DomRectLike,
  cellRects: DomRectLike[],
): { xs: number[]; ys: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const r of cellRects) {
    xs.add(Math.round(r.left - wrapRect.left));
    xs.add(Math.round(r.right - wrapRect.left));
    ys.add(Math.round(r.top - wrapRect.top));
    ys.add(Math.round(r.bottom - wrapRect.top));
  }
  return {
    xs: [...xs].sort((a, b) => a - b),
    ys: [...ys].sort((a, b) => a - b),
  };
}

export type PrintGridBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  xs: number[];
  ys: number[];
};

export function buildPrintTableGridBounds(xs: number[], ys: number[]): PrintGridBounds | null {
  if (xs.length < 2 || ys.length < 2) return null;
  const left = xs[0]!;
  const top = ys[0]!;
  const width = Math.max(1, xs[xs.length - 1]! - left);
  const height = Math.max(1, ys[ys.length - 1]! - top);
  return { left, top, width, height, xs, ys };
}

/** 兼容旧测试名：hairline 计数 = xs + ys */
export function buildPrintTableGridHairlines(
  xs: number[],
  ys: number[],
): { left: number; top: number; width: number; height: number }[] | null {
  const b = buildPrintTableGridBounds(xs, ys);
  if (!b) return null;
  const lines: { left: number; top: number; width: number; height: number }[] = [];
  for (const x of xs) {
    lines.push({ left: x, top: b.top, width: 1, height: b.height });
  }
  for (const y of ys) {
    lines.push({ left: b.left, top: y, width: b.width, height: 1 });
  }
  return lines;
}

export function paintPrintTableGridCanvas(
  canvas: HTMLCanvasElement,
  bounds: PrintGridBounds,
  color: string = MINI_PRINT_GRID_COLOR,
  dpr = 3,
): void {
  const { width, height, left, top, xs, ys } = bounds;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  // 略粗于 1px，抵抗 printToPDF 缩放插值造成的交叉断点
  ctx.lineWidth = 1.25;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  for (const x of xs) {
    let lx = x - left + 0.5;
    if (lx >= width) lx = width - 0.5;
    if (lx < 0) lx = 0.5;
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, height);
  }
  for (const y of ys) {
    let ly = y - top + 0.5;
    if (ly >= height) ly = height - 0.5;
    if (ly < 0) ly = 0.5;
    ctx.moveTo(0, ly);
    ctx.lineTo(width, ly);
  }
  ctx.stroke();
}

export function removePrintTableGridOverlays(root: ParentNode = document): void {
  root.querySelectorAll(`[${MINI_PRINT_GRID_ATTR}]`).forEach((el) => el.remove());
}

export async function installPrintTableGridOverlays(root: ParentNode = document): Promise<number> {
  removePrintTableGridOverlays(root);
  const wraps = root.querySelectorAll(".mini-tpl-table-wrap");
  let n = 0;
  const pending: Promise<void>[] = [];
  for (const wrap of wraps) {
    if (!(wrap instanceof HTMLElement)) continue;
    const table = wrap.querySelector("table.mini-tpl-table");
    if (!(table instanceof HTMLTableElement)) continue;
    const cells = [...table.querySelectorAll("td, th")].filter(
      (c): c is HTMLElement => c instanceof HTMLElement,
    );
    if (!cells.length) continue;

    const wrapRect = wrap.getBoundingClientRect();
    const cellRects = cells.map((c) => c.getBoundingClientRect());
    const { xs, ys } = collectPrintTableGridAxes(wrapRect, cellRects);
    const bounds = buildPrintTableGridBounds(xs, ys);
    if (!bounds) continue;

    const cs = window.getComputedStyle(wrap);
    if (cs.position === "static") {
      wrap.style.position = "relative";
    }

    const canvas = document.createElement("canvas");
    paintPrintTableGridCanvas(canvas, bounds);

    const img = document.createElement("img");
    img.setAttribute(MINI_PRINT_GRID_ATTR, "1");
    img.className = "mini-tpl-print-grid";
    img.alt = "";
    img.src = canvas.toDataURL("image/png");
    img.style.cssText = [
      "position:absolute",
      `left:${bounds.left}px`,
      `top:${bounds.top}px`,
      `width:${bounds.width}px`,
      `height:${bounds.height}px`,
      "pointer-events:none",
      "overflow:visible",
      "z-index:5",
      "image-rendering:pixelated",
      "-webkit-print-color-adjust:exact",
      "print-color-adjust:exact",
    ].join(";");
    wrap.appendChild(img);
    pending.push(
      img.decode().catch(
        () =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );
    n += 1;
  }
  await Promise.all(pending);
  return n;
}
