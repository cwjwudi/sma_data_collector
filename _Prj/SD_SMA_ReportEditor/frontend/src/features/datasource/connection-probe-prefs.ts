import { apiFetch } from "@/api/client.js";

export type ConnectionProbePrefs = {
  enabled: boolean;
  intervalSec: number;
};

export const DEFAULT_CONNECTION_PROBE_PREFS: ConnectionProbePrefs = {
  enabled: false,
  intervalSec: 30,
};

const MIN_INTERVAL_SEC = 10;
const MAX_INTERVAL_SEC = 3600;

export function parseConnectionProbePrefs(raw: unknown): ConnectionProbePrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let intervalSec = DEFAULT_CONNECTION_PROBE_PREFS.intervalSec;
  try {
    const n = Number(o.connection_probe_interval_sec);
    if (Number.isFinite(n)) {
      intervalSec = Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, Math.floor(n)));
    }
  } catch {
    /* keep default */
  }
  return {
    enabled: o.connection_probe_enabled === true,
    intervalSec,
  };
}

export async function loadConnectionProbePrefs(): Promise<ConnectionProbePrefs> {
  try {
    const prefs = await apiFetch("/settings/app_preferences");
    return parseConnectionProbePrefs(prefs);
  } catch {
    return { ...DEFAULT_CONNECTION_PROBE_PREFS };
  }
}

export async function saveConnectionProbePrefs(prefs: ConnectionProbePrefs): Promise<void> {
  await apiFetch("/settings/app_preferences", {
    method: "PATCH",
    body: {
      connection_probe_enabled: prefs.enabled,
      connection_probe_interval_sec: prefs.intervalSec,
    },
  });
}

export function connectionProbeIntervalMs(prefs: ConnectionProbePrefs): number {
  return prefs.intervalSec * 1000;
}
