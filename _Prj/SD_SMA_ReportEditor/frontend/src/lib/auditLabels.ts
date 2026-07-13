/** 操作审计：存盘 action 键 → 界面中文名（含历史类型）。 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "template.save": "保存报表模版",
  "template.delete": "删除报表模版",
  "template.duplicate": "复制报表模版",
  "layout.save": "保存版式",
  "layout.delete": "删除版式",
  "layout.duplicate": "复制版式",
  "config.export": "导出配置备份",
  "config.import": "导入配置",
  "config.reset": "快速复位",
  "db.connection_save": "保存数据库连接",
  "db.connection_delete": "删除数据库连接",
  "opcua.connection_save": "保存 OPC UA 连接",
  "opcua.connection_delete": "删除 OPC UA 连接",
  "datasource.lock": "锁定数据源",
  "datasource.unlock": "解锁数据源",
  "datasource.write_blocked": "数据源写入被拦截",
  "datasource.probe_settings": "修改连接探活设置",
  "demo.apply_connections": "（历史）应用演示连接",
  "demo.health_check": "（历史）演示健康检查",
  "demo.pack_install": "（历史）安装演示包",
  "demo.compose_start": "（历史）启动演示容器",
  "demo.compose_stop": "（历史）停止演示容器",
  "export.batch_trigger": "结批触发导出",
  "export.auto_pdf": "自动导出 PDF",
  "export.manual_pdf": "手动导出 PDF",
  "export.opc_writeback": "导出结果写回 PLC",
  "export.opc_writeback_test": "测试写回 PLC",
  "update.check": "检查软件更新",
  "update.install": "安装软件更新",
  "update.applied": "更新已生效",
  "update.download_installer": "下载安装包",
  "audit.export": "导出操作审计",
};

export const AUDIT_ACTION_OPTIONS: { value: string; label: string }[] = Object.entries(
  AUDIT_ACTION_LABELS,
).map(([value, label]) => ({ value, label }));

export function auditActionLabel(action: string | null | undefined): string {
  const key = (action || "").trim();
  if (!key) return "—";
  return AUDIT_ACTION_LABELS[key] || key;
}

export function auditResultLabel(result: string | null | undefined): string {
  const r = (result || "").trim();
  if (r === "ok") return "成功";
  if (r === "fail") return "失败";
  return r || "—";
}

/** 批量删除摘要用：超过 maxShow 个名称则截断。 */
export function formatAuditNameList(names: string[], maxShow = 5): string {
  const cleaned = names.map((n) => (n || "").trim() || "未命名").filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length <= maxShow) return cleaned.join("、");
  return `${cleaned.slice(0, maxShow).join("、")}…等共 ${cleaned.length} 个`;
}

export function summarizeDeleteTemplates(names: string[]): string {
  if (names.length <= 1) {
    return `删除报表模版「${names[0]?.trim() || "未命名"}」`;
  }
  return `删除 ${names.length} 个报表模版：${formatAuditNameList(names)}`;
}

export function summarizeDeleteLayouts(names: string[]): string {
  if (names.length <= 1) {
    return `删除版式「${names[0]?.trim() || "未命名"}」`;
  }
  return `删除 ${names.length} 个版式：${formatAuditNameList(names)}`;
}

export type AuditDetailLike = Record<string, unknown> | null | undefined;

/** 展开区可读排版（优先 change_lines）。 */
export function formatAuditDetailReadable(
  detail: AuditDetailLike,
  meta?: { objectType?: string | null; objectId?: string | null; actor?: { os_user?: string; hostname?: string } },
): string {
  const d = detail && typeof detail === "object" ? detail : {};
  const lines: string[] = [];
  const ot = meta?.objectType;
  const oid = meta?.objectId;
  if (ot || oid) {
    const typeZh =
      ot === "template" ? "报表模版" : ot === "layout" ? "版式" : ot || "对象";
    lines.push(`对象：${typeZh}${oid ? ` / ${oid}` : ""}`);
  }
  const actor = meta?.actor;
  if (actor && (actor.os_user || actor.hostname)) {
    const parts = [actor.os_user, actor.hostname].filter(Boolean);
    lines.push(`本机用户：${parts.join(" / ")}`);
  }
  const saveCount = d.save_count;
  if (typeof saveCount === "number" && saveCount > 0) {
    lines.push(`保存次数：${saveCount}`);
  }
  const changeCount = d.change_count;
  if (typeof changeCount === "number") {
    lines.push(`变更处数：${changeCount}`);
  }
  const changeLines = d.change_lines;
  if (Array.isArray(changeLines) && changeLines.length) {
    lines.push("");
    lines.push("变更明细：");
    for (const line of changeLines) {
      lines.push(String(line));
    }
  } else if (Array.isArray(d.changes) && d.changes.length) {
    lines.push("");
    lines.push("变更明细：");
    for (const c of d.changes) {
      if (!c || typeof c !== "object") continue;
      const row = c as Record<string, unknown>;
      const loc = String(row.location || "");
      const field = String(row.field || "");
      const kind = String(row.kind || "modify");
      if (kind === "add") {
        lines.push(`${loc}`);
        lines.push(`  · 新增${field}：${row.after ?? ""}`);
      } else if (kind === "remove") {
        lines.push(`${loc}`);
        lines.push(`  · 删除${field}：${row.before ?? ""}`);
      } else {
        lines.push(`${loc}`);
        lines.push(`  · ${field}：${row.before ?? ""} → ${row.after ?? ""}`);
      }
    }
  } else {
    // 旧条目：去掉冗长 JSON 噪音字段后展示
    const skip = new Set(["changes", "change_lines"]);
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (skip.has(k)) continue;
      rest[k] = v;
    }
    if (Object.keys(rest).length) {
      try {
        lines.push(JSON.stringify(rest, null, 2));
      } catch {
        lines.push(String(rest));
      }
    }
  }
  return lines.join("\n").trim() || "—";
}
