import { computed, ref } from "vue";
import { apiFetch } from "@/api/client.js";
import { probeAllDatabaseConnectionsForNav, dbConnectionHealth } from "@/features/datasource/database-connection-health";
import {
  probeConnectionIds,
  probeOpcSavedConnection,
  summarizeConnectionHealth,
  type ConnectionHealthSummary,
} from "@/features/datasource/connection-tab-health";
import {
  pruneOpcConnectionHealth,
  setOpcConnectionHealth,
} from "@/features/datasource/connection-health-detail";

const EMPTY: ConnectionHealthSummary = { ok: 0, fail: 0, total: 0 };

const opcHealthSummary = ref<ConnectionHealthSummary>({ ...EMPTY });
const opcHealthById = ref<Record<string, "ok" | "fail" | "checking" | "unknown">>({});

export { dbConnectionHealth, opcHealthSummary };

export function setOpcHealthSummary(summary: ConnectionHealthSummary) {
  opcHealthSummary.value = summary;
}

function applyOpcHealthState(id: string, state: "ok" | "fail" | "checking" | "unknown", message = "") {
  opcHealthById.value = { ...opcHealthById.value, [id]: state };
  setOpcConnectionHealth(id, state, message);
}

/** 主导航 / 仪表盘：探测全部 DB + OPC 连接 */
export async function probeAllConnectionsForNav() {
  await probeAllDatabaseConnectionsForNav();
  try {
    const data = (await apiFetch("/opcua/servers")) as { servers?: Array<{ id?: string }> };
    const ids = (data.servers || []).map((s) => s.id).filter(Boolean) as string[];
    pruneOpcConnectionHealth(ids);
    if (!ids.length) {
      setOpcHealthSummary({ ...EMPTY });
      opcHealthById.value = {};
      return;
    }
    await probeConnectionIds(ids, probeOpcSavedConnection, applyOpcHealthState, "nav-opc-health");
    setOpcHealthSummary(summarizeConnectionHealth(ids, opcHealthById.value));
  } catch {
    /* 保留上次 OPC 结果 */
  }
}

export const connectionHealthCombined = computed(() => {
  const db = dbConnectionHealth.value;
  const opc = opcHealthSummary.value;
  return {
    ok: db.ok + opc.ok,
    fail: db.fail + opc.fail,
    total: db.total + opc.total,
  };
});

export const hasFailedConnections = computed(() => connectionHealthCombined.value.fail > 0);
