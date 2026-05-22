import { apiFetch } from "@/api/client.js";
import { getTemplate } from "@/api/templates";
import {
  collectBindingDedupeTasks,
  connectionSupportsSql,
  pickPreferredOpcServerId,
  pickPreferredSqlConnectionId,
} from "@/lib/report-template/binding-preview-utils";
import { formatPreflightBlockerSummary } from "@/lib/pdfExportErrors";

export type TemplateExportPreflightResult = {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  summary: string;
};

type NamedEntity = { id: string; name?: string };

async function testSavedDb(connectionId: string, label: string): Promise<string | null> {
  try {
    const res = (await apiFetch(`/database/test_saved/${encodeURIComponent(connectionId)}`, {
      method: "POST",
    })) as { ok?: boolean; message?: string };
    if (res?.ok) return null;
    return res?.message?.trim() || `数据库连接「${label}」测试失败`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `数据库连接「${label}」：${msg}`;
  }
}

async function testSavedOpc(serverId: string, label: string): Promise<string | null> {
  try {
    const res = (await apiFetch(`/opcua/test_saved/${encodeURIComponent(serverId)}`, {
      method: "POST",
    })) as { ok?: boolean; message?: string };
    if (res?.ok) return null;
    return res?.message?.trim() || `OPC UA 连接「${label}」测试失败`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `OPC UA 连接「${label}」：${msg}`;
  }
}

export async function runTemplateExportPreflight(templateId: string): Promise<TemplateExportPreflightResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  let tmpl;
  try {
    tmpl = await getTemplate(templateId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    blockers.push(`无法加载模版：${msg}`);
    return { ok: false, blockers, warnings, summary: formatPreflightBlockerSummary(blockers) };
  }

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

  const servers = ((opcPkg as { servers?: NamedEntity[] }).servers || []) as NamedEntity[];
  const connections = ((connPkg as { connections?: NamedEntity[] }).connections || []) as NamedEntity[];

  const opcServerId = pickPreferredOpcServerId(prefs, servers);
  const sqlCapable = connections.filter((c) =>
    connectionSupportsSql(String((c as { engine?: string }).engine || "")),
  );
  const sqlConnId = pickPreferredSqlConnectionId(prefs, sqlCapable as { id: string; engine?: string }[]);

  const { opcTasks, sqlTasks } = collectBindingDedupeTasks(tmpl, opcServerId, sqlConnId);

  if (opcTasks.length && !opcServerId) {
    blockers.push("模版含 OPC UA 绑定，但未配置可用的 OPC UA 连接。");
  }
  if (sqlTasks.length && !sqlConnId) {
    blockers.push("模版含 SQL 绑定，但未配置可用的数据库连接（需 MySQL/MariaDB/PostgreSQL/SQLite）。");
  }

  const opcIds = [...new Set(opcTasks.map((t) => t.serverId))];
  const sqlIds = [...new Set(sqlTasks.map((t) => t.connectionId))];

  await Promise.all([
    ...opcIds.map(async (id) => {
      const meta = servers.find((s) => s.id === id);
      const label = meta?.name?.trim() || id;
      const err = await testSavedOpc(id, label);
      if (err) blockers.push(err);
    }),
    ...sqlIds.map(async (id) => {
      const meta = connections.find((c) => c.id === id);
      const label = meta?.name?.trim() || id;
      const err = await testSavedDb(id, label);
      if (err) blockers.push(err);
    }),
  ]);

  if (!opcTasks.length && !sqlTasks.length) {
    warnings.push("此模版未检测到 OPC/SQL 绑定，将按静态内容导出。");
  }

  const ok = blockers.length === 0;
  return {
    ok,
    blockers,
    warnings,
    summary: ok ? "" : formatPreflightBlockerSummary(blockers),
  };
}
