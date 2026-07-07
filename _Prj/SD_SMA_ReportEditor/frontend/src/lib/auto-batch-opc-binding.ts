import { loadReportGeneratorPrefs, type ReportGeneratorPrefs } from "@/lib/report-generator-prefs";

/** 自动结批文件名 / 保存目录共用的 OPC String 变量（批次号） */
export type AutoBatchOpcBinding = {
  serverId: string;
  nodeId: string;
  /** 来自文件名片段还是目录变量（展示用） */
  from: "fileName" | "exportDir";
};

/**
 * 解析「结批批次号」OPC 绑定：优先文件名片段 OPC，其次保存目录 OPC。
 * 与生成报表页「OPC UA 自动结批」中用户通常绑定的为同一变量。
 */
export function resolveAutoBatchOpcBinding(
  prefs?: ReportGeneratorPrefs,
): AutoBatchOpcBinding | null {
  const p = prefs ?? loadReportGeneratorPrefs();
  const fileSrv = (p.autoFileNameOpcServerId || "").trim();
  const fileNode = (p.autoFileNameOpcNodeId || "").trim();
  if (fileSrv && fileNode) {
    return { serverId: fileSrv, nodeId: fileNode, from: "fileName" };
  }
  const dirSrv = (p.autoExportDirOpcServerId || "").trim();
  const dirNode = (p.autoExportDirOpcNodeId || "").trim();
  if (dirSrv && dirNode) {
    return { serverId: dirSrv, nodeId: dirNode, from: "exportDir" };
  }
  return null;
}

export function formatAutoBatchOpcBindingHint(binding: AutoBatchOpcBinding | null): string {
  if (!binding) {
    return "未在「生成报表 › OPC UA 自动结批」中配置批次号 OPC 变量（文件名或保存目录 String 变量）。";
  }
  const src = binding.from === "fileName" ? "结批文件名 OPC" : "结批保存目录 OPC";
  return `${src}：${binding.nodeId}`;
}
