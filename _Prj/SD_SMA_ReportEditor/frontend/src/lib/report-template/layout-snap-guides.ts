/** 画布控件拖拽 / 缩放时的边缘与中线吸附，以及对齐辅助线计算（与其它控件、带区边界对齐） */

/** 像素阈值越小越「不粘」，交互越自由 */
export const LAYOUT_SNAP_THRESHOLD_PX = 4;

export type SnapPeer = { id?: string; x: number; y: number; w: number; h: number };

function filterPeers(peers: SnapPeer[], excludeId: string | undefined): SnapPeer[] {
  if (!excludeId) return peers;
  return peers.filter((p) => p.id !== excludeId);
}

/** 竖直线 x、水平线 y 的吸附目标：容器边界与中轴 + 各 peer 的左/中/右、上/中/下 */
export function buildSnapTargets(
  bandW: number,
  bandH: number,
  rects: SnapPeer[],
): { vTargets: number[]; hTargets: number[] } {
  const vx = new Set<number>();
  const hy = new Set<number>();
  vx.add(0);
  vx.add(Math.round(bandW / 2));
  vx.add(Math.round(bandW));
  hy.add(0);
  hy.add(Math.round(bandH / 2));
  hy.add(Math.round(bandH));
  for (const r of rects) {
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.w);
    const h = Math.round(r.h);
    vx.add(x);
    vx.add(x + Math.round(w / 2));
    vx.add(x + w);
    hy.add(y);
    hy.add(y + Math.round(h / 2));
    hy.add(y + h);
  }
  return {
    vTargets: [...vx].sort((a, b) => a - b),
    hTargets: [...hy].sort((a, b) => a - b),
  };
}

function bestDeltaForTranslateAxis(origin: number, span: number, targets: number[], threshold: number): number {
  const edges = [origin, origin + span / 2, origin + span];
  let best = 0;
  let bestAbs = threshold + 1;
  for (const t of targets) {
    for (const p of edges) {
      const d = t - p;
      const ad = Math.abs(d);
      if (ad < bestAbs - 1e-6 || (Math.abs(ad - bestAbs) < 1e-6 && Math.abs(d) < Math.abs(best))) {
        bestAbs = ad;
        best = d;
      }
    }
  }
  return bestAbs <= threshold ? best : 0;
}

/** 平移：将矩形整体吸附到最近的竖线/横线（左/中/右、上/中/下 任一贴合即可） */
export function magneticSnapTranslate(
  x: number,
  y: number,
  w: number,
  h: number,
  bandW: number,
  bandH: number,
  peers: SnapPeer[],
  excludeId: string | undefined,
  threshold = LAYOUT_SNAP_THRESHOLD_PX,
): { x: number; y: number } {
  const rects = filterPeers(peers, excludeId);
  const { vTargets, hTargets } = buildSnapTargets(bandW, bandH, rects);
  const dx = bestDeltaForTranslateAxis(x, w, vTargets, threshold);
  const dy = bestDeltaForTranslateAxis(y, h, hTargets, threshold);
  return {
    x: Math.round(x + dx),
    y: Math.round(y + dy),
  };
}

function snapCoordToTargets(pos: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bd = threshold + 1;
  for (const t of targets) {
    const d = Math.abs(t - pos);
    if (d < bd - 1e-6) {
      bd = d;
      best = t;
    }
  }
  return best !== null && bd <= threshold ? best : null;
}

/** 缩放：根据手柄吸附移动的边到目标线（角点可同时吸附相邻两边） */
export function magneticSnapResize(
  x: number,
  y: number,
  w: number,
  h: number,
  handle: string,
  bandW: number,
  bandH: number,
  peers: SnapPeer[],
  excludeId: string | undefined,
  minW: number,
  minH: number,
  threshold = LAYOUT_SNAP_THRESHOLD_PX,
): { x: number; y: number; w: number; h: number } {
  const rects = filterPeers(peers, excludeId);
  const { vTargets, hTargets } = buildSnapTargets(bandW, bandH, rects);

  let nx = Math.round(x);
  let ny = Math.round(y);
  let nw = Math.round(w);
  let nh = Math.round(h);

  if (handle.includes("e")) {
    const tr = snapCoordToTargets(nx + nw, vTargets, threshold);
    if (tr !== null) nw = Math.max(minW, Math.round(tr - nx));
  }
  if (handle.includes("w")) {
    const tl = snapCoordToTargets(nx, vTargets, threshold);
    if (tl !== null) {
      const delta = Math.round(tl - nx);
      nx += delta;
      nw = Math.max(minW, Math.round(nw - delta));
    }
  }
  if (handle.includes("s")) {
    const tb = snapCoordToTargets(ny + nh, hTargets, threshold);
    if (tb !== null) nh = Math.max(minH, Math.round(tb - ny));
  }
  if (handle.includes("n")) {
    const tt = snapCoordToTargets(ny, hTargets, threshold);
    if (tt !== null) {
      const delta = Math.round(tt - ny);
      ny += delta;
      nh = Math.max(minH, Math.round(nh - delta));
    }
  }

  return { x: nx, y: ny, w: nw, h: nh };
}

/** 吸附完成后，显示与当前矩形边缘或中心重合（±epsilon）的辅助线位置 */
export function alignmentGuidesForRect(
  x: number,
  y: number,
  w: number,
  h: number,
  bandW: number,
  bandH: number,
  peers: SnapPeer[],
  excludeId: string | undefined,
  epsilon = 1.5,
): { v: number[]; h: number[] } {
  const rects = filterPeers(peers, excludeId);
  const { vTargets, hTargets } = buildSnapTargets(bandW, bandH, rects);
  const xl = Math.round(x);
  const xc = Math.round(x + w / 2);
  const xr = Math.round(x + w);
  const yt = Math.round(y);
  const yc = Math.round(y + h / 2);
  const yb = Math.round(y + h);

  const nearV = (t: number) =>
    Math.min(Math.abs(t - xl), Math.abs(t - xc), Math.abs(t - xr)) <= epsilon;
  const nearH = (t: number) =>
    Math.min(Math.abs(t - yt), Math.abs(t - yc), Math.abs(t - yb)) <= epsilon;

  const vxHits = vTargets.filter(nearV);
  const hyHits = hTargets.filter(nearH);
  return { v: [...new Set(vxHits)].sort((a, b) => a - b), h: [...new Set(hyHits)].sort((a, b) => a - b) };
}
