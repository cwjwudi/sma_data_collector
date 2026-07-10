import type { BindingPreviewCell, TableSqlFillDiagnostics } from "@/lib/report-template/binding-preview-utils";

const BINDING_ERR_PREFIX = /^（(?:OPC|SQL|填充)）/;

export type BindingPreviewIssueKind = "opc" | "sql" | "fill" | "other";

/** 单条绑定/填充失败的结构化诊断（写入审计 detail） */
export type BindingPreviewIssueDetail = {
  key: string;
  kind: BindingPreviewIssueKind;
  message: string;
  diagnostics?: TableSqlFillDiagnostics;
};

const EXPORT_DIAG_MARKER = "---EXPORT_DIAGNOSTICS---";

export function collectBindingPreviewIssueDetails(
  values: Record<string, BindingPreviewCell>,
): BindingPreviewIssueDetail[] {
  const issues: BindingPreviewIssueDetail[] = [];
  const seen = new Set<string>();

  const push = (item: BindingPreviewIssueDetail) => {
    const sig = `${item.key}|${item.message}|${item.diagnostics?.sqlExecuted || ""}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    issues.push(item);
  };

  for (const [key, cell] of Object.entries(values)) {
    const text = (cell.text || "").trim();
    if (BINDING_ERR_PREFIX.test(text) && text.length > 4) {
      const kind: BindingPreviewIssueKind = text.startsWith("（OPC）")
        ? "opc"
        : text.startsWith("（SQL）")
          ? "sql"
          : text.startsWith("（填充）")
            ? "fill"
            : "other";
      push({
        key,
        kind,
        message: text,
        diagnostics: cell.tableSqlFill?.diagnostics,
      });
    }
    if (cell.tableSqlFill?.error) {
      push({
        key,
        kind: "fill",
        message: cell.tableSqlFill.error,
        diagnostics: cell.tableSqlFill.diagnostics,
      });
    }
  }
  return issues;
}

/** 兼容旧调用：返回「key：message」字符串列表 */
export function collectBindingPreviewIssues(
  values: Record<string, BindingPreviewCell>,
): string[] {
  return collectBindingPreviewIssueDetails(values).map((x) => {
    const diagLine = formatIssueDiagnosticsOneLine(x.diagnostics);
    return diagLine ? `${x.key}：${x.message}｜${diagLine}` : `${x.key}：${x.message}`;
  });
}

export function formatIssueDiagnosticsOneLine(d?: TableSqlFillDiagnostics | null): string {
  if (!d) return "";
  const parts: string[] = [];
  if (d.resolvedTable) {
    parts.push(
      d.usedFallbackTable
        ? `运行时表名=${d.resolvedTable}（结构参考表兜底）`
        : `运行时表名=${d.resolvedTable}`,
    );
  }
  if (d.tableOpcNodeId) parts.push(`表名OPC=${d.tableOpcNodeId}`);
  if (d.tableOpcRawValue != null && d.tableOpcRawValue !== "" && d.tableOpcRawValue !== d.resolvedTable) {
    parts.push(`OPC原始值=${truncate(d.tableOpcRawValue, 80)}`);
  }
  if (d.tableOpcReadError) parts.push(`OPC读表名失败=${truncate(d.tableOpcReadError, 80)}`);
  if (d.fallbackTable) parts.push(`结构参考表=${d.fallbackTable}`);
  if (d.database) parts.push(`库=${d.database}`);
  if (d.connectionId) parts.push(`连接=${d.connectionId}`);
  if (d.sqlExecuted) parts.push(`SQL=${truncate(d.sqlExecuted, 160)}`);
  return parts.join("；");
}

function truncate(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function summarizeBindingPreviewIssues(issues: string[]): string {
  if (!issues.length) return "";
  const shown = issues.slice(0, 12);
  const more = issues.length > shown.length ? `\n…另有 ${issues.length - shown.length} 处绑定报错` : "";
  return `数据源填充失败（${issues.length} 处）：\n${shown.join("\n")}${more}`;
}

export function summarizeBindingPreviewIssueDetails(details: BindingPreviewIssueDetail[]): string {
  return summarizeBindingPreviewIssues(
    details.map((x) => {
      const diagLine = formatIssueDiagnosticsOneLine(x.diagnostics);
      return diagLine ? `${x.key}：${x.message}｜${diagLine}` : `${x.key}：${x.message}`;
    }),
  );
}

/** 导出失败时写入审计 / IPC 的诊断包 */
export type ExportFailureDiagnostics = {
  stage?: string;
  issueCount?: number;
  issues?: BindingPreviewIssueDetail[];
  stats?: { opcReads?: number; sqlQueries?: number; sqlRows?: number };
  phases?: Record<string, number>;
  templateId?: string;
  note?: string;
  /** 导出窗口内绑定填充整轮重试次数 */
  fillAttempts?: number;
};

export function attachExportDiagnosticsToErrorMessage(
  message: string,
  diagnostics: ExportFailureDiagnostics | null | undefined,
): string {
  const msg = String(message || "").trim() || "导出失败";
  if (!diagnostics || (!diagnostics.issues?.length && !diagnostics.stats && !diagnostics.note)) {
    return msg;
  }
  try {
    return `${msg}\n\n${EXPORT_DIAG_MARKER}\n${JSON.stringify(diagnostics)}`;
  } catch {
    return msg;
  }
}

export function parseExportFailureDiagnostics(raw: unknown): {
  message: string;
  diagnostics: ExportFailureDiagnostics | null;
} {
  let text = "";
  if (raw && typeof raw === "object" && "message" in raw) {
    text = String((raw as { message?: unknown }).message ?? "").trim();
  } else {
    text = String(raw ?? "").trim();
  }
  const idx = text.indexOf(EXPORT_DIAG_MARKER);
  if (idx < 0) return { message: text, diagnostics: null };
  const message = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + EXPORT_DIAG_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as ExportFailureDiagnostics;
    if (!parsed || typeof parsed !== "object") return { message, diagnostics: null };
    return { message, diagnostics: parsed };
  } catch {
    return { message, diagnostics: null };
  }
}

/** 供审计 detail 使用的扁平字段（避免过大） */
export function exportFailureAuditDetail(opts: {
  errorMessage: string;
  diagnostics?: ExportFailureDiagnostics | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const d = opts.diagnostics;
  const issues = (d?.issues || []).slice(0, 40).map((x) => ({
    key: x.key,
    kind: x.kind,
    message: truncate(x.message, 500),
    ...(x.diagnostics
      ? {
          resolvedTable: x.diagnostics.resolvedTable,
          tableOpcNodeId: x.diagnostics.tableOpcNodeId,
          tableOpcRawValue: x.diagnostics.tableOpcRawValue
            ? truncate(x.diagnostics.tableOpcRawValue, 120)
            : undefined,
          usedFallbackTable: x.diagnostics.usedFallbackTable,
          fallbackTable: x.diagnostics.fallbackTable,
          tableOpcReadError: x.diagnostics.tableOpcReadError
            ? truncate(x.diagnostics.tableOpcReadError, 200)
            : undefined,
          database: x.diagnostics.database,
          connectionId: x.diagnostics.connectionId,
          sqlExecuted: x.diagnostics.sqlExecuted
            ? truncate(x.diagnostics.sqlExecuted, 800)
            : undefined,
        }
      : {}),
  }));
  return {
    errorFull: truncate(opts.errorMessage, 4000),
    stage: d?.stage,
    issueCount: d?.issueCount ?? issues.length,
    issues,
    stats: d?.stats,
    phases: d?.phases,
    templateId: d?.templateId,
    note: d?.note,
    ...(opts.extra || {}),
  };
}
