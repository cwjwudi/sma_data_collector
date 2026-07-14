/**
 * 多选属性批改（011 · B3）
 * 交集可见字段 + 混合态读取 + 批量写回。
 */

export type BatchSurface = "template" | "layout";

export type BatchFieldKey =
  | "showBorder"
  | "bgColor"
  | "color"
  | "fontSize"
  | "fontFamily"
  | "textAutoWrap"
  | "alignX"
  | "alignY";

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
};

export type BatchFieldRead =
  | { kind: "uniform"; value: string | number | boolean }
  | { kind: "mixed" };

const FIELD_ORDER: BatchFieldKey[] = [
  "showBorder",
  "bgColor",
  "color",
  "fontSize",
  "fontFamily",
  "textAutoWrap",
  "alignX",
  "alignY",
];

/** 与单选面板能力对齐的字段适用性 */
export function supportsBatchField(el: BatchEl, key: BatchFieldKey, surface: BatchSurface): boolean {
  switch (key) {
    case "showBorder":
    case "bgColor":
      return el.type !== "table";
    case "color":
      // 模版：text/date 有独立文字色；box 有描边色。版式：仅 box 有描边色（text 不强行批改）。
      if (surface === "layout") return el.type === "box";
      return el.type === "text" || el.type === "date" || el.type === "box";
    case "textAutoWrap":
      return el.type === "text" || el.type === "box" || el.type === "date";
    case "alignX":
    case "alignY":
      return el.type !== "image";
    case "fontSize":
    case "fontFamily":
      // 单选面板对所有类型都渲染字号/字体
      return true;
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
  return FIELD_ORDER.filter((key) => els.every((el) => supportsBatchField(el, key, surface)));
}

function normalizeShowBorder(v: unknown): boolean {
  return v !== false;
}

function readRaw(el: BatchEl, key: BatchFieldKey): string | number | boolean {
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
  value: string | number | boolean,
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
      default:
        continue;
    }
    if (readRaw(el, key) !== before) n += 1;
  }
  return n;
}
