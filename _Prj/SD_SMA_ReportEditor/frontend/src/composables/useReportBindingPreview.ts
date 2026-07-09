import { ref, type Ref } from "vue";
import { apiFetch } from "@/api/client.js";
import type { ReportTemplate } from "@/lib/report-template/model";
import {
  collectBindingDedupeTasks,
  connectionSupportsSql,
  formatOpcuaReadPayload,
  pickPreferredOpcServerId,
  pickPreferredSqlConnectionId,
  resolveSqlParamValues,
  sqlResponseFirstScalar,
  sqlResponseGridSummary,
  substituteScalarSqlParams,
  type BindingPreviewCell,
  type SqlDedupeTask,
} from "@/lib/report-template/binding-preview-utils";
import { resolveAutoBatchOpcBinding } from "@/lib/auto-batch-opc-binding";
import { loadReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import type { TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import {
  buildTableSqlFillPreviewTasks,
  sanitizeOpcTableName,
  sqlResponseToPreviewRows,
  substituteSqlFillTableName,
} from "@/lib/report-template/table-sql-fill-preview";
import { isVerticalSqlFill } from "@/lib/report-template/table-sql-fill";
import type {
  BindingPreviewRefreshOptions,
  BindingPreviewStats,
  ReportBindingPreviewState,
} from "@/lib/report-template/template-editor-context";

function sqlResponseRowCount(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const rows = (data as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? rows.length : 0;
}

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
  const lastStats = ref<BindingPreviewStats | null>(null);
  let generation = 0;

  async function refresh(opts?: BindingPreviewRefreshOptions): Promise<void> {
    const t = tmplRef.value;
    const gen = ++generation;
    const stats: BindingPreviewStats = { opcReads: 0, sqlQueries: 0, sqlRows: 0 };
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
      const [prefs, opcPkg, connPkg] = await Promise.all([
        apiFetch("/settings/app_preferences").catch(() => ({}) as Record<string, unknown>) as Promise<
          Record<string, unknown>
        >,
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

      const batchBinding = resolveAutoBatchOpcBinding(loadReportGeneratorPrefs());

      async function substituteSqlWithResolvedParams(
        sql: string,
        params: TableSqlParamBinding[],
      ): Promise<string> {
        const paramValues = await resolveSqlParamValues(params, {
          defaultOpcServerId: opcServerId,
          batchBinding,
          onOpcRead: () => {
            stats.opcReads += 1;
          },
          readOpc: async (serverId, nodeId) =>
            (await apiFetch(`/opcua/read_saved/${serverId}`, {
              method: "POST",
              body: { node_id: nodeId },
            })) as { ok?: boolean; message?: string; value?: unknown },
        });
        return substituteScalarSqlParams(sql, params, paramValues);
      }

      async function resolveScalarSqlTask(task: SqlDedupeTask): Promise<string> {
        return substituteSqlWithResolvedParams(task.sql, task.params || []);
      }

      if (doOpc) {
        await runPool(opcTasks, 8, async (task) => {
          if (gen !== generation) return;
          try {
            stats.opcReads += 1;
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
            stats.sqlQueries += 1;
            const body: Record<string, unknown> = {
              connection_id: task.connectionId,
              sql,
              limit: 200,
            };
            // 可视化点选生成的标量 SQL 带有库名；连接未设默认库时必须传入，否则 MySQL 1046
            if (task.database) body.database = task.database;
            const data = await apiFetch("/database/query/sql", {
              method: "POST",
              body,
            });
            if (gen !== generation) return;
            stats.sqlRows += sqlResponseRowCount(data);
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
            let sql = task.sql;
            // 表名绑定 OPC：读取变量得到实际表名（分表场景），失败回退设计时表
            if (task.tableOpc && sql.includes("{{table}}")) {
              let tableName = "";
              let readErr = "";
              if (opcServerId) {
                try {
                  stats.opcReads += 1;
                  const res = (await apiFetch(`/opcua/read_saved/${opcServerId}`, {
                    method: "POST",
                    body: { node_id: task.tableOpc.nodeId },
                  })) as { ok?: boolean; message?: string; value?: unknown };
                  if (res.ok === false) readErr = String(res.message || "读取失败");
                  else tableName = sanitizeOpcTableName(res.value);
                } catch (e) {
                  readErr = e instanceof Error ? e.message : String(e);
                }
              } else {
                readErr = "未配置可用的 OPC UA 连接";
              }
              if (!tableName) tableName = sanitizeOpcTableName(task.tableOpc.fallbackTable);
              if (!tableName) {
                throw new Error(`表名 OPC 变量不可用${readErr ? `：${readErr}` : ""}，且未选择可用的默认表`);
              }
              sql = substituteSqlFillTableName(sql, task.tableOpc.engine, tableName);
            }
            // 表格填充的筛选参数与标量 SQL 同规则取值：OPC UA / 结批批次号 / 手写兜底
            if (task.params.length && /\{\{p\d+\}\}/i.test(sql)) {
              sql = await substituteSqlWithResolvedParams(sql, task.params);
            }
            const body: Record<string, unknown> = {
              connection_id: task.connectionId,
              sql,
              limit: task.limit,
            };
            if (task.database) body.database = task.database;
            stats.sqlQueries += 1;
            const data = await apiFetch("/database/query/sql", {
              method: "POST",
              body,
            });
            if (gen !== generation) return;
            stats.sqlRows += sqlResponseRowCount(data);
            const mapCols =
              task.fill && !isVerticalSqlFill(task.fill)
                ? task.tableCols ?? task.colCount
                : task.colCount;
            const grid = sqlResponseToPreviewRows(data, mapCols, task.fill);
            if (opts?.mutateTemplateRows !== false) {
              task.expandRows(grid.length);
            }
            out[task.key] = {
              text: `${grid.length}×${task.colCount}`,
              tableSqlFill: { dataRows: grid },
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (opts?.mutateTemplateRows !== false) {
              task.expandRows(0);
            }
            out[task.key] = {
              text: `（填充）${msg}`,
              tableSqlFill: { dataRows: [], error: msg },
            };
          }
        });
      }

      if (gen !== generation) return;
      values.value = out;
      lastStats.value = stats;
    } finally {
      if (!silent && gen === generation) loading.value = false;
    }
  }

  return { values, loading, refresh, lastStats };
}
