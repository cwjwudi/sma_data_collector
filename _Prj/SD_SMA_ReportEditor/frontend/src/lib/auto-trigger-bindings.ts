import type { AutoTriggerLogEntry } from "@/lib/auto-trigger-log";
import { normalizeTriggerLog } from "@/lib/auto-trigger-log";
import type { AutoOpcTriggerMode } from "@/lib/report-generator-prefs";

/** 单条 OPC 触发 → 导出模版 绑定 */
export interface AutoTriggerBinding {
  id: string;
  templateId: string | null;
  serverId: string;
  nodeId: string;
  mode: AutoOpcTriggerMode;
  /** 「值等于」模式下的比较文本（如 1、true、OK） */
  compareValue: string;
  /** 触发与导出记录（最新在前，最多保留 AUTO_TRIGGER_LOG_MAX 条） */
  triggerLog: AutoTriggerLogEntry[];
}

export function newAutoTriggerBindingId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createAutoTriggerBinding(partial?: Partial<AutoTriggerBinding>): AutoTriggerBinding {
  return {
    id: partial?.id?.trim() || newAutoTriggerBindingId(),
    templateId: typeof partial?.templateId === "string" ? partial.templateId : (partial?.templateId ?? null),
    serverId: typeof partial?.serverId === "string" ? partial.serverId : "",
    nodeId: typeof partial?.nodeId === "string" ? partial.nodeId : "",
    mode: normalizeMode(partial?.mode),
    compareValue: typeof partial?.compareValue === "string" ? partial.compareValue : "1",
    triggerLog: partial?.triggerLog ? [...partial.triggerLog] : [],
  };
}

function normalizeMode(v: unknown): AutoOpcTriggerMode {
  if (v === "falling") return "falling";
  if (v === "equals") return "equals";
  if (v === "rising") return "rising";
  if (v === "truthy") return "rising";
  return "rising";
}

function normalizeCompareValue(o: Record<string, unknown>): string {
  if (typeof o.compareValue === "string") return o.compareValue;
  if (typeof o.equalsText === "string") return o.equalsText;
  return "1";
}

export function normalizeAutoTriggerBinding(raw: unknown): AutoTriggerBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return createAutoTriggerBinding({
    id: typeof o.id === "string" ? o.id : undefined,
    templateId: typeof o.templateId === "string" ? o.templateId : null,
    serverId: typeof o.serverId === "string" ? o.serverId : "",
    nodeId: typeof o.nodeId === "string" ? o.nodeId : "",
    mode: normalizeMode(o.mode),
    compareValue: normalizeCompareValue(o),
    triggerLog: normalizeTriggerLog(o.triggerLog),
  });
}

type LegacyAutoSlice = {
  serverId?: string;
  nodeId?: string;
  mode?: unknown;
  equalsText?: string;
};

/** 从偏好 JSON 解析绑定列表（含旧版单条迁移） */
export function loadAutoTriggerBindings(
  rawBindings: unknown,
  legacyAuto: LegacyAutoSlice | undefined,
  legacyTemplateId: string | null | undefined,
): AutoTriggerBinding[] {
  if (Array.isArray(rawBindings)) {
    const out: AutoTriggerBinding[] = [];
    for (const item of rawBindings) {
      const b = normalizeAutoTriggerBinding(item);
      if (b) out.push(b);
    }
    return out;
  }

  const srv = typeof legacyAuto?.serverId === "string" ? legacyAuto.serverId : "";
  const nid = typeof legacyAuto?.nodeId === "string" ? legacyAuto.nodeId : "";
  if (!srv.trim() && !nid.trim()) return [];

  const legacyMode = normalizeMode(legacyAuto?.mode);
  return [
    createAutoTriggerBinding({
      templateId: typeof legacyTemplateId === "string" ? legacyTemplateId : null,
      serverId: srv,
      nodeId: nid,
      mode: legacyMode,
      compareValue:
        typeof legacyAuto?.equalsText === "string" ? legacyAuto.equalsText : "1",
    }),
  ];
}

export function bindingConfigKey(b: AutoTriggerBinding): string {
  return `${b.id}|${b.serverId}|${b.nodeId}|${b.mode}|${b.compareValue}|${b.templateId || ""}`;
}

export function isTriggerBindingComplete(b: AutoTriggerBinding): boolean {
  if (!b.templateId?.trim() || !b.serverId.trim() || !b.nodeId.trim()) return false;
  if (b.mode === "equals" && !b.compareValue.trim()) return false;
  return true;
}

export function parseRgTriggerPickTarget(target: string | null): string | null {
  if (!target?.startsWith("trigger:")) return null;
  const id = target.slice("trigger:".length).trim();
  return id || null;
}

export function rgTriggerPickTarget(bindingId: string): string {
  return `trigger:${bindingId}`;
}

/** 自动导出 OPC 轮询间隔（固定 1 秒，不在界面配置） */
export const AUTO_OPC_POLL_INTERVAL_MS = 1000;
