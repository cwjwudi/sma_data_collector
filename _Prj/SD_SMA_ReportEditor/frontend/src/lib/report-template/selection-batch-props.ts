/**
 * 多选属性批改（011 · B3 + 018 扩展）
 * 交集可见字段 + 混合态读取 + 批量写回。
 */

import { normalizeNullDisplayMode, type NullDisplayMode } from "./layout-zone-element";
import { normalizeDecimalPlaces } from "./numeric-display";

export type BatchSurface = "template" | "layout";

export type BindingKind = "none" | "opcua" | "sql" | "mongo";

export type BatchFieldKey =
  | "showBorder"
  | "bgColor"
  | "color"
  | "fontSize"
  | "fontFamily"
  | "textAutoWrap"
  | "alignX"
  | "alignY"
  | "decimalPlaces"
  | "nullDisplayMode"
  | "dateFormat"
  | "text"
  | "bindingKind"
  | "opcuaNodeId"
  | "sqlText";

/** 批改所需最小元素形状（模版 / 版式均可） */
export type BatchEl = {
  type: string;
  showBorder?: boolean;
  bgColor?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  textAutoWrap?: boolean;
  alignX?: string;
  alignY?: string;
  bindingKind?: BindingKind | string;
  opcuaNodeId?: string;
  sqlText?: string;
  text?: string;
  nullDisplayMode?: NullDisplayMode | string;
  decimalPlaces?: number;
  dateFormat?: string;
};

export type BatchFieldValue = string | number | boolean | null;

export type BatchFieldRead =
  | { kind: "uniform"; value: BatchFieldValue }
  | { kind: "mixed" };

/** 模版/版式均可绑定批改的控件类型 */
export const BINDABLE_ELEMENT_TYPES = ["text", "box", "parameter"] as const;
export type BindableElementType = (typeof BINDABLE_ELEMENT_TYPES)[number];

/** @deprecated 别名，与 BINDABLE_ELEMENT_TYPES 相同 */
export const BINDING_TYPES_TEMPLATE = BINDABLE_ELEMENT_TYPES;

const FIELD_ORDER: BatchFieldKey[] = [
  "showBorder",
  "bgColor",
  "color",
  "fontSize",
  "fontFamily",
  "textAutoWrap",
  "alignX",
  "alignY",
  "text",
  "decimalPlaces",
  "nullDisplayMode",
  "dateFormat",
];

export function isBindableElementType(type: string): type is BindableElementType {
  return (BINDABLE_ELEMENT_TYPES as readonly string[]).includes(type);
}

/** 全部同类型 → 该类型；否则 null */
export function sameElementType(els: readonly BatchEl[]): string | null {
  if (!els.length) return null;
  const t = els[0]!.type;
  return els.every((el) => el.type === t) ? t : null;
}

export function bindingKindOptionsForType(type: string, _surface: BatchSurface): BindingKind[] {
  if (type === "text" || type === "box") return ["none", "opcua"];
  if (type === "parameter") return ["none", "opcua", "sql", "mongo"];
  return ["none"];
}

/** 同类型且类型支持绑定 → 可展示绑定区 */
export function canShowBindingSection(els: readonly BatchEl[], surface: BatchSurface): boolean {
  const t = sameElementType(els);
  if (!t) return false;
  return isBindableElementType(t);
}

/** 多选且类型不一致，但其中含可绑定类型 → 用于提示 */
export function hasSomeBindableAmongMixedTypes(els: readonly BatchEl[]): boolean {
  if (els.length < 2) return false;
  const types = new Set(els.map((e) => e.type));
  if (types.size <= 1) return false;
  return els.some((e) => isBindableElementType(e.type));
}

function normalizeBindingKind(v: unknown): BindingKind {
  if (v === "opcua" || v === "sql" || v === "mongo") return v;
  return "none";
}

function supportsDisplayFormatFields(el: BatchEl): boolean {
  return el.type === "text" || el.type === "box" || el.type === "parameter";
}

function supportsTextField(el: BatchEl): boolean {
  return el.type === "text" || el.type === "box" || el.type === "parameter";
}

/** 与单选面板能力对齐的字段适用性 */
export function supportsBatchField(el: BatchEl, key: BatchFieldKey, surface: BatchSurface): boolean {
  switch (key) {
    case "showBorder":
    case "bgColor":
      return el.type !== "table";
    case "color":
      if (surface === "layout") return el.type === "box";
      return el.type === "text" || el.type === "date" || el.type === "box";
    case "textAutoWrap":
      return el.type === "text" || el.type === "box" || el.type === "date";
    case "alignX":
    case "alignY":
      return el.type !== "image";
    case "fontSize":
    case "fontFamily":
      return true;
    case "decimalPlaces":
    case "nullDisplayMode":
      return supportsDisplayFormatFields(el);
    case "dateFormat":
      return el.type === "date";
    case "text":
      return supportsTextField(el);
    case "bindingKind":
    case "opcuaNodeId":
      return isBindableElementType(el.type);
    case "sqlText":
      return el.type === "parameter";
    default:
      return false;
  }
}

/** 选中 &lt; 2 返回空；仅保留每一项都支持的字段（交集）。 */
export function intersectBatchFields(
  els: readonly BatchEl[],
  surface: BatchSurface,
): BatchFieldKey[] {
  if (els.length < 2) return [];
  const keys = FIELD_ORDER.filter((key) => els.every((el) => supportsBatchField(el, key, surface)));

  if (canShowBindingSection(els, surface)) {
    const type = sameElementType(els)!;
    const kindOpts = bindingKindOptionsForType(type, surface);
    keys.push("bindingKind");
    if (kindOpts.includes("opcua")) keys.push("opcuaNodeId");
    if (type === "parameter") keys.push("sqlText");
  }

  return keys;
}

function normalizeShowBorder(v: unknown): boolean {
  return v !== false;
}

function readRaw(el: BatchEl, key: BatchFieldKey): BatchFieldValue {
  switch (key) {
    case "showBorder":
      return normalizeShowBorder(el.showBorder);
    case "bgColor":
      return typeof el.bgColor === "string" ? el.bgColor : "transparent";
    case "color":
      return typeof el.color === "string" ? el.color : "#18181b";
    case "fontSize": {
      const n = Number(el.fontSize);
      return Number.isFinite(n) ? n : 14;
    }
    case "fontFamily":
      return typeof el.fontFamily === "string" ? el.fontFamily : "";
    case "textAutoWrap":
      return !!el.textAutoWrap;
    case "alignX":
      return typeof el.alignX === "string" ? el.alignX : "start";
    case "alignY":
      return typeof el.alignY === "string" ? el.alignY : "center";
    case "decimalPlaces": {
      const n = normalizeDecimalPlaces(el.decimalPlaces);
      return n === undefined ? "" : n;
    }
    case "nullDisplayMode":
      return normalizeNullDisplayMode(el.nullDisplayMode);
    case "dateFormat":
      return typeof el.dateFormat === "string" && el.dateFormat.trim()
        ? el.dateFormat.trim()
        : "HH:mm:ss";
    case "text":
      return typeof el.text === "string" ? el.text : "";
    case "bindingKind":
      return normalizeBindingKind(el.bindingKind);
    case "opcuaNodeId":
      return typeof el.opcuaNodeId === "string" ? el.opcuaNodeId : "";
    case "sqlText":
      return typeof el.sqlText === "string" ? el.sqlText : "";
    default:
      return "";
  }
}

export function readBatchField(els: readonly BatchEl[], key: BatchFieldKey): BatchFieldRead {
  if (!els.length) return { kind: "mixed" };
  const first = readRaw(els[0]!, key);
  for (let i = 1; i < els.length; i++) {
    if (readRaw(els[i]!, key) !== first) return { kind: "mixed" };
  }
  return { kind: "uniform", value: first };
}

/** 批量写回；返回实际改动的元素个数。 */
export function applyBatchField(
  els: BatchEl[],
  key: BatchFieldKey,
  value: BatchFieldValue,
): number {
  let n = 0;
  for (const el of els) {
    const before = readRaw(el, key);
    switch (key) {
      case "showBorder":
        el.showBorder = !!value;
        break;
      case "bgColor":
        el.bgColor = String(value);
        break;
      case "color":
        el.color = String(value);
        break;
      case "fontSize": {
        const num = Number(value);
        if (!Number.isFinite(num)) continue;
        el.fontSize = Math.min(72, Math.max(8, Math.round(num)));
        break;
      }
      case "fontFamily":
        el.fontFamily = String(value);
        break;
      case "textAutoWrap":
        el.textAutoWrap = !!value;
        break;
      case "alignX":
        el.alignX = String(value);
        break;
      case "alignY":
        el.alignY = String(value);
        break;
      case "decimalPlaces":
        if (value === null || value === "") {
          el.decimalPlaces = undefined;
        } else {
          const dp = normalizeDecimalPlaces(value);
          el.decimalPlaces = dp === undefined ? undefined : dp;
        }
        break;
      case "nullDisplayMode":
        el.nullDisplayMode = normalizeNullDisplayMode(value);
        break;
      case "dateFormat":
        el.dateFormat = String(value).trim() || "HH:mm:ss";
        break;
      case "text":
        el.text = String(value);
        break;
      case "bindingKind":
        el.bindingKind = normalizeBindingKind(value);
        break;
      case "opcuaNodeId":
        el.opcuaNodeId = String(value);
        break;
      case "sqlText":
        el.sqlText = String(value);
        break;
      default:
        continue;
    }
    if (readRaw(el, key) !== before) n += 1;
  }
  return n;
}
