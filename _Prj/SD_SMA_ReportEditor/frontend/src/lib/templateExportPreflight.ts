import { apiFetch } from "@/api/client.js";
import { getTemplate } from "@/api/templates";
import {
  collectBindingDedupeTasks,
  connectionSupportsMongo,
  connectionSupportsSql,
  forEachTemplateCanvasElement,
  forEachZoneLayoutElement,
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

type NamedEntity = { id: string; name?: string; engine?: string };

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

async function pingSavedOpc(serverId: string, label: string): Promise<string | null> {
  try {
    // ping_saved 复用后端连接池：常态下毫秒级返回，避免结批预检每次完整握手
    const res = (await apiFetch(`/opcua/ping_saved/${encodeURIComponent(serverId)}`, {
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

  // 模版、偏好、连接列表并行拉取，缩短结批前的串行等待
  const [tmplRes, prefs, opcPkg, connPkg] = await Promise.all([
    getTemplate(templateId).then(
      (t) => ({ ok: true as const, t }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
    apiFetch("/settings/app_preferences").catch(() => ({}) as Record<string, unknown>) as Promise<
      Record<string, unknown>
    >,
    apiFetch("/opcua/servers").catch(() => ({ servers: [] })),
    apiFetch("/database/connections").catch(() => ({ connections: [] })),
  ]);

  if (!tmplRes.ok) {
    const msg = tmplRes.e instanceof Error ? tmplRes.e.message : String(tmplRes.e);
    blockers.push(`无法加载模版：${msg}`);
    return { ok: false, blockers, warnings, summary: formatPreflightBlockerSummary(blockers) };
  }
  const tmpl = tmplRes.t;

  const servers = ((opcPkg as { servers?: NamedEntity[] }).servers || []) as NamedEntity[];
  const connections = ((connPkg as { connections?: NamedEntity[] }).connections || []) as NamedEntity[];

  const opcServerId = pickPreferredOpcServerId(prefs, servers);
  const sqlCapable = connections.filter((c) => connectionSupportsSql(String(c.engine || "")));
  const mongoCapable = connections.filter((c) => connectionSupportsMongo(String(c.engine || "")));
  const sqlConnId = pickPreferredSqlConnectionId(prefs, sqlCapable as { id: string; engine?: string }[]);

  const { opcTasks, sqlTasks, mongoTasks } = collectBindingDedupeTasks(tmpl, opcServerId, sqlConnId);

  let enabledSqlFillCount = 0;
  let splitSqlFillCount = 0;
  const sqlFillConnectionIds = new Set<string>();
  const mongoFillConnectionIds = new Set<string>();
  function collectSqlFill(el: { type?: string; tableSqlFill?: unknown }) {
    if (el.type !== "table") return;
    const fill = el.tableSqlFill as
      | {
          enabled?: boolean;
          fillMode?: string;
          visualSource?: { connectionId?: string };
          mongoQuery?: { connectionId?: string };
          splitReportsOnMaxRows?: boolean;
        }
      | null
      | undefined;
    if (!fill?.enabled) return;
    enabledSqlFillCount += 1;
    if (fill.splitReportsOnMaxRows) splitSqlFillCount += 1;
    if (fill.fillMode === "mongo") {
      const mongoId = String(fill.mongoQuery?.connectionId || "").trim();
      if (mongoId) mongoFillConnectionIds.add(mongoId);
      return;
    }
    const id =
      fill.fillMode === "visual"
        ? String(fill.visualSource?.connectionId || "").trim()
        : String(sqlConnId || "").trim();
    if (id) sqlFillConnectionIds.add(id);
  }
  forEachTemplateCanvasElement(tmpl, (el) => {
    collectSqlFill(el);
  });
  forEachZoneLayoutElement(tmpl, (el) => {
    collectSqlFill(el);
  });

  if (splitSqlFillCount > 0 && enabledSqlFillCount !== 1) {
    blockers.push("开启“超出最大数量自动分报表”后，模板中只允许保留一个数据库填充表。");
  }

  if (opcTasks.length && !opcServerId) {
    blockers.push("模版含 OPC UA 绑定，但未配置可用的 OPC UA 连接。");
  }
  const needsSql =
    sqlTasks.length > 0 || [...sqlFillConnectionIds].some((id) => !connectionSupportsMongo(
      String(connections.find((c) => c.id === id)?.engine || ""),
    ));
  if (needsSql && !sqlConnId && sqlFillConnectionIds.size === 0) {
    blockers.push(
      "模版含 SQL 绑定，但未配置可用的数据库连接（需 MySQL / MariaDB / PostgreSQL / SQLite）。",
    );
  }
  if ((mongoTasks.length > 0 || mongoFillConnectionIds.size > 0) && mongoCapable.length === 0) {
    blockers.push("模版含 MongoDB 绑定，但未配置可用的 MongoDB 连接。");
  }

  const opcIds = [...new Set(opcTasks.map((t) => t.serverId))];
  const dbIds = [
    ...new Set([
      ...sqlTasks.map((t) => t.connectionId),
      ...mongoTasks.map((t) => t.connectionId),
      ...sqlFillConnectionIds,
      ...mongoFillConnectionIds,
    ]),
  ];

  await Promise.all([
    ...opcIds.map(async (id) => {
      const meta = servers.find((s) => s.id === id);
      const label = meta?.name?.trim() || id;
      const err = await pingSavedOpc(id, label);
      if (err) blockers.push(err);
    }),
    ...dbIds.map(async (id) => {
      const meta = connections.find((c) => c.id === id);
      const label = meta?.name?.trim() || id;
      const eng = String(meta?.engine || "").toLowerCase();
      const kind = connectionSupportsMongo(eng) ? "MongoDB" : "SQL";
      const err = await testSavedDb(id, `${label}（${kind}）`);
      if (err) blockers.push(err);
    }),
  ]);

  if (!opcTasks.length && !sqlTasks.length && !mongoTasks.length && enabledSqlFillCount === 0) {
    warnings.push("此模版未检测到 OPC / SQL / Mongo 绑定，将按静态内容导出。");
  }

  const ok = blockers.length === 0;
  return {
    ok,
    blockers,
    warnings,
    summary: ok ? "" : formatPreflightBlockerSummary(blockers),
  };
}
