import type { LayoutSnapshot } from "./layout-model";
import { getPaperPageCssPx, mmToCssPx, type PaperKind } from "./paper";

export interface PaperLayoutMetrics {
  pageW: number;
  pageH: number;
  contentLeft: number;
  contentTop: number;
  contentW: number;
  contentH: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  hb: number;
  fb: number;
}

/** 纸张像素尺寸与正文区（模版控件坐标系原点位于正文左上角） */
export function computePaperLayout(
  paperKind: PaperKind,
  orientation: "portrait" | "landscape",
  snap: LayoutSnapshot
): PaperLayoutMetrics {
  const { widthPx: pageW, heightPx: pageH } = getPaperPageCssPx(paperKind, orientation);
  const ml = mmToCssPx(snap.marginLeftMm);
  const mr = mmToCssPx(snap.marginRightMm);
  const mt = mmToCssPx(snap.marginTopMm);
  const mb = mmToCssPx(snap.marginBottomMm);
  const hb = mmToCssPx(snap.headerBandMm);
  const fb = mmToCssPx(snap.footerBandMm);
  const contentLeft = ml;
  const contentTop = mt + hb;
  const contentW = Math.max(40, pageW - ml - mr);
  const contentH = Math.max(40, pageH - mt - mb - hb - fb);
  return { pageW, pageH, contentLeft, contentTop, contentW, contentH, ml, mr, mt, mb, hb, fb };
}
