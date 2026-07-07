/**
 * PLC 心跳（软件可用信号）：应用级单例，按配置周期向 OPC UA 变量写入
 * Bool 翻转或递增计数，PLC 侧看门狗据此判断报表软件是否在线。
 */
import { ref, type Ref } from "vue";
import { loadReportGeneratorPrefs, type PlcHeartbeatConfig } from "@/lib/report-generator-prefs";
import { writeSavedOpcNodeValue } from "@/lib/opcua-write";

export type PlcHeartbeatState = {
  /** 状态一行文本（生成报表页显示） */
  status: Ref<string>;
  /** 最近一次写入是否成功（null = 尚未写过） */
  lastOk: Ref<boolean | null>;
};

const status = ref("");
const lastOk = ref<boolean | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;
let writing = false;
let toggleValue = false;
let counterValue = 0;
const COUNTER_MAX = 32000; // 兼容 PLC INT（16 位有符号）

export const plcHeartbeatState: PlcHeartbeatState = { status, lastOk };

function heartbeatConfigKey(hb: PlcHeartbeatConfig): string {
  return [hb.enabled, hb.serverId, hb.nodeId, hb.intervalMs, hb.mode].join("\u0000");
}

let activeConfigKey = "";

function nextValue(mode: PlcHeartbeatConfig["mode"]): boolean | number {
  if (mode === "counter") {
    counterValue = counterValue >= COUNTER_MAX ? 1 : counterValue + 1;
    return counterValue;
  }
  if (mode === "toggle") {
    toggleValue = !toggleValue;
    return toggleValue;
  }
  // constant_one：软件持续写 1，PLC 收到后清零；后端按节点类型自动转 Bool/Int
  return 1;
}

function modeLabel(mode: PlcHeartbeatConfig["mode"]): string {
  if (mode === "counter") return "计数";
  if (mode === "toggle") return "Bool 翻转";
  return "常写 1";
}

async function beatOnce(hb: PlcHeartbeatConfig): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    const value = nextValue(hb.mode);
    const res = await writeSavedOpcNodeValue(hb.serverId, hb.nodeId, value);
    lastOk.value = res.ok;
    status.value = res.ok
      ? `[PLC 心跳] 正常（每 ${hb.intervalMs} 毫秒写入 ${modeLabel(hb.mode)}）`
      : `[PLC 心跳] 写入失败：${res.message || "未知错误"}`;
  } catch (e) {
    lastOk.value = false;
    status.value = `[PLC 心跳] 写入失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    writing = false;
  }
}

function restart(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const hb = loadReportGeneratorPrefs().heartbeat;
  activeConfigKey = heartbeatConfigKey(hb);
  if (!hb.enabled || !hb.serverId.trim() || !hb.nodeId.trim()) {
    status.value = hb.enabled ? "[PLC 心跳] 请绑定 OPC UA 连接与心跳变量…" : "";
    lastOk.value = null;
    return;
  }
  const intervalMs = Math.max(100, Math.floor(hb.intervalMs));
  status.value = "[PLC 心跳] 已启用，等待首次写入…";
  void beatOnce(hb);
  timer = setInterval(() => {
    // 每拍读取最新配置：Node/间隔被改动时自动重启
    const cur = loadReportGeneratorPrefs().heartbeat;
    if (heartbeatConfigKey(cur) !== activeConfigKey) {
      restart();
      return;
    }
    void beatOnce(cur);
  }, intervalMs);
}

export function initPlcHeartbeat(): void {
  if (timer) return;
  restart();
  window.addEventListener("report-generator-prefs-updated", restart);
  window.addEventListener("report-generator-auto-export-changed", restart);
}

export function disposePlcHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  window.removeEventListener("report-generator-prefs-updated", restart);
  window.removeEventListener("report-generator-auto-export-changed", restart);
}

export function notifyPlcHeartbeatSettingsChanged(): void {
  restart();
}
