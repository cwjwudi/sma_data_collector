import type { AutoOpcTriggerMode } from "@/lib/report-generator-prefs";

export interface OpcTriggerPollState {
  /** 是否已有上一采样（用于边沿检测） */
  primed: boolean;
  prev: unknown;
}

export function createOpcTriggerPollState(): OpcTriggerPollState {
  return { primed: false, prev: undefined };
}

function isTruthyRaw(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v !== 0 && Number.isFinite(v);
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s) return false;
    if (s === "0" || s === "false") return false;
    return true;
  }
  return false;
}

function coerceText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}

/** OPC 读值是否与比较文本相等（数值与字符串 "5" / 5 视为相等） */
export function opcValueEqualsCompare(raw: unknown, compareText: string): boolean {
  const expected = (compareText ?? "").trim();
  if (raw === null || raw === undefined) return expected === "";

  if (typeof raw === "boolean") {
    const exp = expected.toLowerCase();
    if (exp === "true" || exp === "1") return raw === true;
    if (exp === "false" || exp === "0") return raw === false;
    return String(raw) === expected;
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Number(expected);
    if (Number.isFinite(n)) return raw === n;
    return String(raw) === expected;
  }

  return coerceText(raw).trim() === expected;
}

/**
 * 是否应在本次采样触发自动导出（上层再结合冷却时间防抖）。
 *
 * 首个采样仅记录基线、一律不触发：打开软件时触发变量往往还保持上一批的置位值，
 * 若首采样即触发会在启动瞬间打出一发「幽灵结批」，并在导出忙碌期间吞掉用户
 * 真正的第一批边沿（现场表现为「刚打开软件第一次结批没有输出」）。
 */
export function evaluateAutoOpcTrigger(
  mode: AutoOpcTriggerMode,
  raw: unknown,
  compareValue: string,
  state: OpcTriggerPollState,
): boolean {
  if (!state.primed) {
    state.primed = true;
    state.prev = raw;
    return false;
  }

  if (mode === "equals") {
    const match = opcValueEqualsCompare(raw, compareValue);
    const prevMatch = opcValueEqualsCompare(state.prev, compareValue);
    state.prev = raw;
    return match && !prevMatch;
  }

  const curT = isTruthyRaw(raw);

  if (mode === "falling") {
    const prevT = isTruthyRaw(state.prev);
    state.prev = raw;
    return !curT && prevT;
  }

  // rising（默认）
  const prevT = isTruthyRaw(state.prev);
  state.prev = raw;
  return curT && !prevT;
}
