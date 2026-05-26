import { reactive } from "vue";
import type { ConnectionHealthState } from "@/features/datasource/connection-tab-health";

export type ConnectionHealthRecord = {
  state: ConnectionHealthState;
  message: string;
  checkedAt: number | null;
};

const EMPTY: ConnectionHealthRecord = { state: "unknown", message: "", checkedAt: null };

const dbById = reactive<Record<string, ConnectionHealthRecord>>({});
const opcById = reactive<Record<string, ConnectionHealthRecord>>({});

function writeRecord(
  map: Record<string, ConnectionHealthRecord>,
  id: string,
  state: ConnectionHealthState,
  message = "",
) {
  const key = id.trim();
  if (!key) return;
  map[key] = {
    state,
    message: message.trim(),
    checkedAt: state === "checking" ? map[key]?.checkedAt ?? null : Date.now(),
  };
}

export function setDbConnectionHealth(id: string, state: ConnectionHealthState, message = "") {
  writeRecord(dbById, id, state, message);
}

export function setOpcConnectionHealth(id: string, state: ConnectionHealthState, message = "") {
  writeRecord(opcById, id, state, message);
}

export function getDbConnectionHealth(id: string): ConnectionHealthRecord {
  return dbById[id.trim()] || EMPTY;
}

export function getOpcConnectionHealth(id: string): ConnectionHealthRecord {
  return opcById[id.trim()] || EMPTY;
}

export function pruneDbConnectionHealth(validIds: string[]) {
  const keep = new Set(validIds.map((x) => x.trim()).filter(Boolean));
  for (const k of Object.keys(dbById)) {
    if (!keep.has(k)) delete dbById[k];
  }
}

export function pruneOpcConnectionHealth(validIds: string[]) {
  const keep = new Set(validIds.map((x) => x.trim()).filter(Boolean));
  for (const k of Object.keys(opcById)) {
    if (!keep.has(k)) delete opcById[k];
  }
}

export function formatConnectionHealthTooltip(
  record: ConnectionHealthRecord,
  connectionLabel: string,
): string {
  const name = connectionLabel.trim() || "连接";
  if (record.state === "ok") {
    const t = formatCheckedAt(record.checkedAt);
    return t ? `${name}：连接正常（${t}）` : `${name}：连接正常`;
  }
  if (record.state === "fail") {
    const err = record.message || "连接失败";
    const t = formatCheckedAt(record.checkedAt);
    return t ? `${name}：${err}（${t}）` : `${name}：${err}`;
  }
  if (record.state === "checking") return `${name}：正在检测…`;
  return `${name}：尚未检测`;
}

function formatCheckedAt(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}
