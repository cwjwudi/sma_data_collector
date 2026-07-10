import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { blankZonesSnapshot, hydrateLayoutPreset, presetZonesSnapshot } from "@/lib/report-template/layout-model";
import type { ReportTemplate, TemplateControlType, TemplateElement } from "@/lib/report-template/model";
import { ensureTableGrid, hydrateTableCell, makeElement } from "@/lib/report-template/model";
import type { LayoutControlType, LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { hydrateTableSqlFill } from "@/lib/report-template/table-sql-fill";
import { templateHasBackSheet, templateHasCoverSheet } from "@/lib/report-template/editor-sheet";

export type LayoutPresetSlot = "body" | "cover" | "back";

/**
 * 封面/末页版式正文区可提升到模版画布的类型（与 TemplateControlType 交集）。
 * pageNumber 仅存在于版式区，不进入模版画布。
 */
const LIFTABLE_ZONE_TO_TEMPLATE: ReadonlySet<LayoutControlType> = new Set([
  "text",
  "box",
  "image",
  "date",
  "parameter",
  "table",
]);

function isLiftableZoneType(type: LayoutControlType): boolean {
  return LIFTABLE_ZONE_TO_TEMPLATE.has(type);
}

/** 版式区表格 → 封面/末页画布表格控件（字段语义一致，逐项拷贝深副本） */
export function templateTableFromZoneTable(z: LayoutZoneElement): TemplateElement {
  const el = makeElement("table");
  el.id = z.id;
  el.x = z.x;
  el.y = z.y;
  el.w = z.w;
  el.h = z.h;
  el.text = z.text;
  el.color = z.color;
  el.bgColor = z.bgColor;
  el.fontSize = z.fontSize;
  el.fontFamily = z.fontFamily;
  el.zIndex = z.zIndex;
  el.textAutoWrap = z.textAutoWrap;
  el.tableRows = z.tableRows;
  el.tableCols = z.tableCols;
  el.tableRowHeightPx = z.tableRowHeightPx;
  el.tableColWidthsPx = Array.isArray(z.tableColWidthsPx) ? [...z.tableColWidthsPx] : undefined;
  el.tableColBgColors = Array.isArray(z.tableColBgColors) ? [...z.tableColBgColors] : undefined;
  el.tableCells = (z.tableCells ?? []).map((row) => row.map((c) => hydrateTableCell(c)));
  el.tableSqlFill = hydrateTableSqlFill(z.tableSqlFill);
  ensureTableGrid(el);
  return el;
}

/** 版式区非表格控件 → 模版画布控件（可拖拽/缩放/属性编辑） */
export function templateElementFromZoneElement(z: LayoutZoneElement): TemplateElement | null {
  if (!isLiftableZoneType(z.type)) return null;
  if (z.type === "table") return templateTableFromZoneTable(z);

  const el = makeElement(z.type as TemplateControlType);
  el.id = z.id;
  el.x = z.x;
  el.y = z.y;
  el.w = z.w;
  el.h = z.h;
  el.text = z.text;
  el.color = z.color;
  el.bgColor = z.bgColor;
  el.fontSize = z.fontSize;
  el.fontFamily = z.fontFamily;
  el.zIndex = z.zIndex;
  el.textAutoWrap = z.textAutoWrap;
  el.alignX = z.alignX;
  el.alignY = z.alignY;
  el.dateFormat = z.dateFormat;
  el.imageSrc = z.imageSrc;
  el.imageRotationDeg = z.imageRotationDeg;
  el.imageCaptionPosition = z.imageCaptionPosition;
  el.bindingKind = z.bindingKind === "opcua" || z.bindingKind === "sql" ? z.bindingKind : "none";
  el.opcuaNodeId = z.opcuaNodeId;
  el.sqlText = z.sqlText;
  el.sqlParams = Array.isArray(z.sqlParams) ? z.sqlParams.map((p) => ({ ...p })) : [];
  el.scalarSqlFillMode = z.scalarSqlFillMode;
  el.scalarSqlVisual = z.scalarSqlVisual ? { ...z.scalarSqlVisual } : undefined;
  return el;
}

/**
 * 把封面/末页「版式装饰层」中的可编辑控件提升到画布：
 * 装饰层 pointer-events:none，无法拖拽/缩放；提升后与正文控件同等可交互。
 * 画布已有同 id 控件时保留画布版本（用户可能已改过）。
 */
export function liftZoneBodyElementsToSheetCanvas(tmpl: ReportTemplate): boolean {
  let touched = false;
  for (const slot of ["cover", "back"] as const) {
    const zoneArr = slot === "cover" ? tmpl.coverBodyZoneElements : tmpl.backBodyZoneElements;
    if (!Array.isArray(zoneArr) || zoneArr.length === 0) continue;
    const canvas = slot === "cover" ? tmpl.coverElements : tmpl.backElements;
    const rest: LayoutZoneElement[] = [];
    for (const z of zoneArr) {
      if (!isLiftableZoneType(z.type)) {
        rest.push(z);
        continue;
      }
      touched = true;
      if (!canvas.some((e) => e.id === z.id)) {
        const te = templateElementFromZoneElement(z);
        if (te) canvas.push(te);
      }
    }
    if (rest.length !== zoneArr.length) {
      if (slot === "cover") tmpl.coverBodyZoneElements = rest;
      else tmpl.backBodyZoneElements = rest;
    }
  }
  return touched;
}

/** @deprecated 使用 liftZoneBodyElementsToSheetCanvas；保留别名兼容旧调用 */
export function liftZoneTablesToSheetCanvas(tmpl: ReportTemplate): boolean {
  return liftZoneBodyElementsToSheetCanvas(tmpl);
}

/**
 * 将单项版式合并进模版对应槽位（与新建向导语义一致）。
 *
 * `mode`（仅封面/末页槽位生效）：
 * - `"user"`（默认）：用户显式套用版式——版式正文区可提升控件落到可编辑画布；
 * - `"resync"`：载入时按版式库静默拉齐——可提升类型从装饰层剔除但不再回填画布，
 *   保证用户此前删除的控件不会在每次打开时复活。
 */
export function applyLayoutPresetToTemplate(
  tmpl: ReportTemplate,
  preset: LayoutPreset,
  slot: LayoutPresetSlot,
  mode: "user" | "resync" = "user",
): void {
  const z = presetZonesSnapshot(hydrateLayoutPreset(preset));
  if (slot === "body") {
    tmpl.layoutPresetId = preset.id;
    tmpl.layoutSnapshot = { ...z.layoutSnapshot };
    tmpl.headerText = z.headerText;
    tmpl.footerText = z.footerText;
    tmpl.headerElements = z.headerElements.map((e) => ({ ...e }));
    tmpl.footerElements = z.footerElements.map((e) => ({ ...e }));
    return;
  }
  if (slot === "cover") {
    tmpl.coverLayoutPresetId = preset.id;
    tmpl.coverLayoutSnapshot = { ...z.layoutSnapshot };
    tmpl.coverHeaderText = z.headerText;
    tmpl.coverFooterText = z.footerText;
    tmpl.coverHeaderElements = z.headerElements.map((e) => ({ ...e }));
    tmpl.coverFooterElements = z.footerElements.map((e) => ({ ...e }));
    tmpl.coverBodyZoneElements = z.bodyElements.map((e) => ({ ...e }));
    if (mode === "user") liftZoneBodyElementsToSheetCanvas(tmpl);
    else dropZoneLiftableFromDecor(tmpl);
    return;
  }
  tmpl.backLayoutPresetId = preset.id;
  tmpl.backLayoutSnapshot = { ...z.layoutSnapshot };
  tmpl.backHeaderText = z.headerText;
  tmpl.backFooterText = z.footerText;
  tmpl.backHeaderElements = z.headerElements.map((e) => ({ ...e }));
  tmpl.backFooterElements = z.footerElements.map((e) => ({ ...e }));
  tmpl.backBodyZoneElements = z.bodyElements.map((e) => ({ ...e }));
  if (mode === "user") liftZoneBodyElementsToSheetCanvas(tmpl);
  else dropZoneLiftableFromDecor(tmpl);
}

/** 重同步时剔除装饰层中可提升类型（画布中已提升/已删除的以画布为准） */
function dropZoneLiftableFromDecor(tmpl: ReportTemplate): void {
  tmpl.coverBodyZoneElements = tmpl.coverBodyZoneElements.filter((e) => !isLiftableZoneType(e.type));
  tmpl.backBodyZoneElements = tmpl.backBodyZoneElements.filter((e) => !isLiftableZoneType(e.type));
}

/** 取消封面/末页：清空版式绑定、纸上快照、眉脚区与画布控件（与新建向导「不使用」一致）。 */
export function clearOptionalSheetFromTemplate(tmpl: ReportTemplate, slot: "cover" | "back"): void {
  const z = blankZonesSnapshot();
  if (slot === "cover") {
    tmpl.coverLayoutPresetId = null;
    tmpl.coverLayoutSnapshot = { ...z.layoutSnapshot };
    tmpl.coverHeaderText = z.headerText;
    tmpl.coverFooterText = z.footerText;
    tmpl.coverHeaderElements = [];
    tmpl.coverFooterElements = [];
    tmpl.coverBodyZoneElements = [];
    tmpl.coverElements = [];
    return;
  }
  tmpl.backLayoutPresetId = null;
  tmpl.backLayoutSnapshot = { ...z.layoutSnapshot };
  tmpl.backHeaderText = z.headerText;
  tmpl.backFooterText = z.footerText;
  tmpl.backHeaderElements = [];
  tmpl.backFooterElements = [];
  tmpl.backBodyZoneElements = [];
  tmpl.backElements = [];
}

function hasBoundLayoutPresetId(presetId: string | null | undefined): boolean {
  return String(presetId ?? "").trim().length > 0;
}

/**
 * 旧版「断开版式 ID」会留下眉脚区快照，导致列表缩略图仍显示封面/封尾。
 * 无绑定 ID、无画布控件时，将残留区段收拢为「未选用」。
 */
export function stripStaleOptionalSheetZones(tmpl: ReportTemplate, slot: "cover" | "back"): boolean {
  const presetId = slot === "cover" ? tmpl.coverLayoutPresetId : tmpl.backLayoutPresetId;
  if (hasBoundLayoutPresetId(presetId)) return false;
  const canvas = slot === "cover" ? tmpl.coverElements : tmpl.backElements;
  if (canvas.length > 0) return false;
  const hasSheet = slot === "cover" ? templateHasCoverSheet(tmpl) : templateHasBackSheet(tmpl);
  if (!hasSheet) return false;
  clearOptionalSheetFromTemplate(tmpl, slot);
  return true;
}

/**
 * 模版在各槽位记录的 `*LayoutPresetId` 仅表示「曾套用哪条版式」；纸上内容来自嵌入快照。
 * 版式库更新后，用当前 presets 列表中的同名 ID 再套用一遍，使画布/缩略图与最新版式一致。
 * （未绑定 ID 的槽位不变；版式已删除则跳过该槽位。）
 */
export function resyncTemplateBoundPresets(tmpl: ReportTemplate, presets: LayoutPreset[]): boolean {
  let touched = false;
  const bodyId = tmpl.layoutPresetId;
  if (bodyId) {
    const p = presets.find((x) => x.id === bodyId && x.pageRole === "normal");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "body");
      touched = true;
    }
  }
  const covId = tmpl.coverLayoutPresetId;
  if (covId) {
    const p = presets.find((x) => x.id === covId && x.pageRole === "cover");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "cover", "resync");
      touched = true;
    }
  }
  const backId = tmpl.backLayoutPresetId;
  if (backId) {
    const p = presets.find((x) => x.id === backId && x.pageRole === "back");
    if (p) {
      applyLayoutPresetToTemplate(tmpl, p, "back", "resync");
      touched = true;
    }
  }
  return touched;
}
