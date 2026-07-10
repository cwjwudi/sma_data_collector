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
import {
  isRetryableTableFillError,
  retryDelayMs,
  sleepMs,
  SQL_FILL_RETRY_DELAYS_MS,
  SQL_FILL_RETRY_MAX_ATTEMPTS,
} from "@/lib/report-template/sql-fill-retry";
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
  const statusText = ref("");
  const lastStats = ref<BindingPreviewStats | null>(null);
  let generation = 0;

  async function refresh(opts?: BindingPreviewRefreshOptions): Promise<void> {
    const t = tmplRef.value;
    const gen = ++generation;
    const stats: BindingPreviewStats = { opcReads: 0, sqlQueries: 0, sqlRows: 0 };
    if (!t) {
      values.value = {};
      statusText.value = "";
      return;
    }

    const doOpc = opts?.opc !== false;
    const doSql = opts?.sql !== false;
    const silent = opts?.silent === true;
    const partial = !doOpc || !doSql;

    if (!silent) {
      loading.value = true;
      statusText.value = "正在连接数据源…";
    }
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
        if (!silent && opcTasks.length) {
          statusText.value = `正在读取 OPC UA（${opcTasks.length} 项）…`;
        }
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
        if (!silent && sqlTasks.length) {
          statusText.value = `正在查询数据库绑定（${sqlTasks.length} 项）…`;
        }
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
        if (!silent && fillTasks.length) {
          statusText.value = `正在读取表格填充数据（${fillTasks.length} 张表）…`;
        }
        await runPool(fillTasks, 4, async (task) => {
          if (gen !== generation) return;
          let resolvedTable = "";
          let tableOpcRawValue = "";
          let usedFallbackTable = false;
          let tableOpcReadError = "";
          let sqlForDiag = task.sql;
          const retriedTables: string[] = [];
          let attempt = 0;
          let lastErr: unknown = null;

          async function readOpcTableName(): Promise<{ tableName: string; readErr: string; raw: string }> {
            let tableName = "";
            let readErr = "";
            let raw = "";
            if (opcServerId) {
              try {
                stats.opcReads += 1;
                const res = (await apiFetch(`/opcua/read_saved/${opcServerId}`, {
                  method: "POST",
                  body: { node_id: task.tableOpc!.nodeId },
                })) as { ok?: boolean; message?: string; value?: unknown };
                if (res.ok === false) readErr = String(res.message || "读取失败");
                else {
                  raw = res.value === null || res.value === undefined ? "" : String(res.value);
                  tableName = sanitizeOpcTableName(res.value);
                }
              } catch (e) {
                readErr = e instanceof Error ? e.message : String(e);
              }
            } else {
              readErr = "未配置可用的 OPC UA 连接";
            }
            return { tableName, readErr, raw };
          }

          while (attempt < SQL_FILL_RETRY_MAX_ATTEMPTS) {
            attempt += 1;
            if (gen !== generation) return;
            if (attempt > 1) {
              await sleepMs(retryDelayMs(attempt - 2, SQL_FILL_RETRY_DELAYS_MS));
              if (gen !== generation) return;
            }
            resolvedTable = "";
            tableOpcRawValue = "";
            usedFallbackTable = false;
            tableOpcReadError = "";
            try {
              let sql = task.sql;
              // 表名绑定 OPC：读取变量得到实际表名（分表场景），失败回退设计时表
              if (task.tableOpc && sql.includes("{{table}}")) {
                const { tableName: opcName, readErr, raw } = await readOpcTableName();
                tableOpcRawValue = raw;
                tableOpcReadError = readErr;
                let tableName = opcName;
                if (!tableName) {
                  tableName = sanitizeOpcTableName(task.tableOpc.fallbackTable);
                  usedFallbackTable = Boolean(tableName);
                }
                if (!tableName) {
                  throw new Error(
                    `表名 OPC 变量不可用${readErr ? `：${readErr}` : ""}，且未选择可用的默认表`,
                  );
                }
                resolvedTable = tableName;
                retriedTables.push(tableName);
                sql = substituteSqlFillTableName(sql, task.tableOpc.engine, tableName);
              }
              // 表格填充的筛选参数与标量 SQL 同规则取值：OPC UA / 结批批次号 / 手写兜底
              if (task.params.length && /\{\{p\d+\}\}/i.test(sql)) {
                sql = await substituteSqlWithResolvedParams(sql, task.params);
              }
              sqlForDiag = sql;
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
                tableSqlFill: {
                  dataRows: grid,
                  ...(attempt > 1
                    ? {
                        diagnostics: {
                          connectionId: task.connectionId,
                          database: task.database || "",
                          resolvedTable: resolvedTable || undefined,
                          tableOpcNodeId: task.tableOpc?.nodeId || undefined,
                          tableOpcRawValue: tableOpcRawValue || undefined,
                          usedFallbackTable: task.tableOpc ? usedFallbackTable : undefined,
                          fallbackTable: task.tableOpc?.fallbackTable || undefined,
                          retryAttempts: attempt,
                          retriedTables: retriedTables.length ? [...retriedTables] : undefined,
                        },
                      }
                    : {}),
                },
              };
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
              const msg = e instanceof Error ? e.message : String(e);
              const canRetry =
                attempt < SQL_FILL_RETRY_MAX_ATTEMPTS &&
                Boolean(task.tableOpc) &&
                isRetryableTableFillError(msg);
              if (canRetry) continue;
              break;
            }
          }

          if (lastErr != null) {
            const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
            if (opts?.mutateTemplateRows !== false) {
              task.expandRows(0);
            }
            const retryNote =
              attempt > 1
                ? `（已重试 ${attempt} 次重读 OPC 表名：${retriedTables.join(" → ") || "—"}）`
                : "";
            out[task.key] = {
              text: `（填充）${msg}${retryNote ? ` ${retryNote}` : ""}`,
              tableSqlFill: {
                dataRows: [],
                error: msg,
                diagnostics: {
                  connectionId: task.connectionId,
                  database: task.database || "",
                  resolvedTable: resolvedTable || undefined,
                  tableOpcNodeId: task.tableOpc?.nodeId || undefined,
                  tableOpcRawValue: tableOpcRawValue || undefined,
                  usedFallbackTable: task.tableOpc ? usedFallbackTable : undefined,
                  fallbackTable: task.tableOpc?.fallbackTable || undefined,
                  tableOpcReadError: tableOpcReadError || undefined,
                  sqlExecuted: sqlForDiag ? String(sqlForDiag).slice(0, 2000) : undefined,
                  retryAttempts: attempt,
                  retriedTables: retriedTables.length ? [...retriedTables] : undefined,
                },
              },
            };
          }
        });
      }

      if (gen !== generation) return;
      values.value = out;
      lastStats.value = stats;
    } finally {
      if (!silent && gen === generation) {
        loading.value = false;
        statusText.value = "";
      }
    }
  }

  return { values, loading, statusText, refresh, lastStats };
}
