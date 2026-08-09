/**
 * 041 H1：封面 / 正文 / 末页页眉各自独立；提供「封面页眉 → 正文」一键复制，消解认知差。
 */
import type { ReportTemplate } from "@/lib/report-template/model";
import { hydrateLayoutZoneElement, type LayoutZoneElement } from "@/lib/report-template/layout-zone-element";

export type CopyCoverHeaderToBodyResult = {
  /** 写入正文的页眉控件数（不含仅文本占位） */
  copied: number;
  /** 正文原先已有页眉控件或 headerText */
  replacedExisting: boolean;
  /** 是否抬高了正文 headerBandMm（避免封面高眉带被裁） */
  headerBandMmRaised: boolean;
};

function hasHeaderContent(
  els: LayoutZoneElement[] | null | undefined,
  text: string | null | undefined,
): boolean {
  if (Array.isArray(els) && els.length > 0) return true;
  return Boolean(String(text || "").trim());
}

/** 封面有眉、正文无眉 → 编辑器可提示一键复制 */
export function templateNeedsCoverHeaderCopyHint(tmpl: ReportTemplate): boolean {
  return (
    hasHeaderContent(tmpl.coverHeaderElements, tmpl.coverHeaderText) &&
    !hasHeaderContent(tmpl.headerElements, tmpl.headerText)
  );
}

function cloneZoneKeepPos(src: LayoutZoneElement): LayoutZoneElement {
  const raw = JSON.parse(JSON.stringify(src)) as Partial<LayoutZoneElement>;
  delete raw.id;
  const el = hydrateLayoutZoneElement(raw);
  el.x = Math.max(0, Number(src.x) || 0);
  el.y = Math.max(0, Number(src.y) || 0);
  return el;
}

/**
 * 将封面页眉控件与 headerText 深拷到正文槽（新 id，坐标不变）。
 * 若封面眉带更高，同步抬高正文 `layoutSnapshot.headerBandMm`。
 */
export function copyCoverHeaderToBody(tmpl: ReportTemplate): CopyCoverHeaderToBodyResult {
  const src = Array.isArray(tmpl.coverHeaderElements) ? tmpl.coverHeaderElements : [];
  const coverText = String(tmpl.coverHeaderText || "");
  if (!hasHeaderContent(src, coverText)) {
    return { copied: 0, replacedExisting: false, headerBandMmRaised: false };
  }

  const replacedExisting = hasHeaderContent(tmpl.headerElements, tmpl.headerText);
  tmpl.headerElements = src.map((el) => cloneZoneKeepPos(el));
  tmpl.headerText = coverText;

  let headerBandMmRaised = false;
  const coverMm = Number(tmpl.coverLayoutSnapshot?.headerBandMm);
  const bodyMm = Number(tmpl.layoutSnapshot?.headerBandMm);
  if (
    tmpl.layoutSnapshot &&
    Number.isFinite(coverMm) &&
    coverMm > 0 &&
    (!Number.isFinite(bodyMm) || coverMm > bodyMm)
  ) {
    tmpl.layoutSnapshot.headerBandMm = coverMm;
    headerBandMmRaised = Number.isFinite(bodyMm) ? coverMm > bodyMm : true;
  }

  return {
    copied: tmpl.headerElements.length,
    replacedExisting,
    headerBandMmRaised,
  };
}
