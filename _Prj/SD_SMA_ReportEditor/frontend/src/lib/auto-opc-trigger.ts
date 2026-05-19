import type { AutoOpcTriggerMode } from "@/lib/report-generator-prefs";

export interface OpcTriggerPollState {
  /** rising：至少见过一次采样后才评估边沿 */
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

/** 是否应在本次采样触发自动导出（上层再结合冷却时间防抖）。 */
export function evaluateAutoOpcTrigger(
  mode: AutoOpcTriggerMode,
  raw: unknown,
  equalsText: string,
  state: OpcTriggerPollState,
): boolean {
  if (mode === "equals") {
    state.prev = raw;
    state.primed = true;
    return coerceText(raw).trim() === (equalsText || "").trim();
  }

  if (mode === "rising") {
    if (!state.primed) {
      state.primed = true;
      state.prev = raw;
      return false;
    }
    const curT = isTruthyRaw(raw);
    const prevT = isTruthyRaw(state.prev);
    state.prev = raw;
    return curT && !prevT;
  }

  // truthy
  state.prev = raw;
  state.primed = true;
  return isTruthyRaw(raw);
}
