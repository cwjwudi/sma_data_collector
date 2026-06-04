import { ref, type Ref } from "vue";
import { apiFetch } from "@/api/client.js";
import type { ReportTemplate } from "@/lib/report-template/model";
import {
  collectBindingDedupeTasks,
  connectionSupportsSql,
  formatOpcuaReadPayload,
  pickPreferredOpcServerId,
  pickPreferredSqlConnectionId,
  sqlResponseFirstScalar,
  sqlResponseGridSummary,
  substituteScalarSqlParams,
  type BindingPreviewCell,
  type SqlDedupeTask,
} from "@/lib/report-template/binding-preview-utils";
import {
  buildTableSqlFillPreviewTasks,
  sqlResponseToPreviewRows,
} from "@/lib/report-template/table-sql-fill-preview";
import type {
  BindingPreviewRefreshOptions,
  ReportBindingPreviewState,
} from "@/lib/report-template/template-editor-context";

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) break;
      await fn(items[idx]);
    }
  }
  const workers = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

export function useReportBindingPreview(tmplRef: Ref<ReportTemplate | null>): ReportBindingPreviewState {
  const values = ref<Record<string, BindingPreviewCell>>({});
  const loading = ref(false);
  let generation = 0;

  async function refresh(opts?: BindingPreviewRefreshOptions): Promise<void> {
    const t = tmplRef.value;
    const gen = ++generation;
    if (!t) {
      values.value = {};
      return;
    }

    const doOpc = opts?.opc !== false;
    const doSql = opts?.sql !== false;
    const silent = opts?.silent === true;
    const partial = !doOpc || !doSql;

    if (!silent) loading.value = true;
    try {
      let prefs: Record<string, unknown> = {};
      try {
        prefs = (await apiFetch("/settings/app_preferences")) as Record<string, unknown>;
      } catch {
        prefs = {};
      }

      const [opcPkg, connPkg] = await Promise.all([
        apiFetch("/opcua/servers").catch(() => ({ servers: [] })),
        apiFetch("/database/connections").catch(() => ({ connections: [] })),
      ]);

      if (gen !== generation) return;

      const servers = (opcPkg as { servers?: { id: string }[] }).servers || [];
      const connections = (connPkg as { connections?: { id: string; engine?: string }[] }).connections || [];

      let opcServerId = pickPreferredOpcServerId(prefs, servers);
      if (!opcServerId && servers.length) opcServerId = servers[0].id;

      const sqlCapableAll = connections.filter((c) => connectionSupportsSql(c.engine || ""));
      let sqlConnId = pickPreferredSqlConnectionId(prefs, sqlCapableAll);
      if (!sqlConnId && sqlCapableAll.length) sqlConnId = sqlCapableAll[0].id;

      const { opcTasks, sqlTasks } = collectBindingDedupeTasks(t, opcServerId, sqlConnId);

      const out: Record<string, BindingPreviewCell> = partial ? { ...values.value } : {};

      async function resolveScalarSqlTask(task: SqlDedupeTask): Promise<string> {
        const paramValues: Record<number, unknown> = {};
        const params = task.params || [];
        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          if (p?.source !== "opcua") continue;
          const nodeId = (p.opcuaNodeId || "").trim();
          if (!nodeId) {
            if ((p.literalFallback || "").trim()) continue;
            throw new Error(`SQL 参数 {{p${i}}} 未绑定 OPC UA 节点`);
          }
          if (!opcServerId) {
            if ((p.literalFallback || "").trim()) continue;
            throw new Error(`SQL 参数 {{p${i}}} 未配置 OPC UA 连接`);
          }
          try {
            const res = (await apiFetch(`/opcua/read_saved/${opcServerId}`, {
              method: "POST",
              body: { node_id: nodeId },
            })) as { ok?: boolean; message?: string; value?: unknown };
            if (res?.ok === false) {
              if ((p.literalFallback || "").trim()) continue;
              throw new Error(res.message || "OPC 参数读取失败");
            }
            if ((res.value === null || res.value === undefined) && (p.literalFallback || "").trim()) continue;
            paramValues[i] = res.value;
          } catch (e) {
            if ((p.literalFallback || "").trim()) continue;
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`SQL 参数 {{p${i}}} 读取失败：${msg}`);
          }
        }
        return substituteScalarSqlParams(task.sql, params, paramValues);
      }

      if (doOpc) {
        await runPool(opcTasks, 8, async (task) => {
          if (gen !== generation) return;
          try {
            const res = await apiFetch(`/opcua/read_saved/${task.serverId}`, {
              method: "POST",
              body: { node_id: task.nodeId },
            });
            if (gen !== generation) return;
            const fmt = formatOpcuaReadPayload(res);
            const text = fmt.ok ? fmt.text : `（OPC）${fmt.err}`;
            for (const k of task.keys) out[k] = { text };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            for (const k of task.keys) out[k] = { text: `（OPC）${msg}` };
          }
        });
      }

      if (gen !== generation) return;

      if (doSql) {
        await runPool(sqlTasks, 6, async (task) => {
          if (gen !== generation) return;
          try {
            const sql = await resolveScalarSqlTask(task);
            const data = await apiFetch("/database/query/sql", {
              method: "POST",
              body: {
                connection_id: task.connectionId,
                sql,
                limit: 200,
              },
            });
            if (gen !== generation) return;
            for (const k of task.keys) {
              if (k.startsWith("chart:")) {
                out[k] = { text: sqlResponseGridSummary(data) };
              } else {
                out[k] = { text: sqlResponseFirstScalar(data) };
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            for (const k of task.keys) out[k] = { text: `（SQL）${msg}` };
          }
        });

        if (gen !== generation) return;

        const fillTasks = buildTableSqlFillPreviewTasks(t, sqlConnId, {
          fullSqlFill: opts?.fullSqlFill === true,
        });
        await runPool(fillTasks, 4, async (task) => {
          if (gen !== generation) return;
          try {
            const body: Record<string, unknown> = {
              connection_id: task.connectionId,
              sql: task.sql,
              limit: task.limit,
            };
            if (task.database) body.database = task.database;
            const data = await apiFetch("/database/query/sql", {
              method: "POST",
              body,
            });
            if (gen !== generation) return;
            const grid = sqlResponseToPreviewRows(data, task.colCount);
            task.expandRows(grid.length);
            out[task.key] = {
              text: `${grid.length}×${task.colCount}`,
              tableSqlFill: { dataRows: grid },
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            task.expandRows(0);
            out[task.key] = {
              text: `（填充）${msg}`,
              tableSqlFill: { dataRows: [], error: msg },
            };
          }
        });
      }

      if (gen !== generation) return;
      values.value = out;
    } finally {
      if (!silent && gen === generation) loading.value = false;
    }
  }

  return { values, loading, refresh };
}
