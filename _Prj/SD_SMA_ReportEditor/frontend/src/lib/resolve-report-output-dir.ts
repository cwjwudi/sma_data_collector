/**
 * 046 批次 / 非批次报表导出目标解析（自动结批与手动导出共用）。
 *
 * - batch：`全局导出根/<批号>/`；批号取结批文件名 OPC → 保存目录 OPC，任一有效即可；
 *   均无有效批号时显式失败（不再静默回落全局根，Q5A/Q9C）。
 * - nonBatch：模版配置的本机绝对路径；非法/缺失显式失败（Q2A）；
 *   目录不存在由写盘端 mkdir recursive 创建（Q8B）。
 */
import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import type { ReportKind } from "@/lib/report-template/model";
import { coerceOpcFileNameString, readSavedOpcStringValue } from "@/lib/opcua-string-variables";

export type BatchNoSource = "fileName" | "exportDir";

export type ResolvedReportOutputTarget =
  | {
      ok: true;
      kind: ReportKind;
      dir: string;
      /** 仅 batch：解析出的批号目录段 */
      batchNo?: string;
      /** 仅 batch：批号来自哪个 OPC 绑定 */
      batchNoSource?: BatchNoSource;
    }
  | { ok: false; kind: ReportKind; error: string };

const WINDOWS_RESERVED_DIR_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function joinDirSegment(baseDir: string, segment: string): string {
  const cleanBase = baseDir.trim().replace(/[\\/]+$/, "");
  const separator = cleanBase.includes("\\") && !cleanBase.includes("/") ? "\\" : "/";
  return `${cleanBase}${separator}${segment}`;
}

/** 批号目录段清洗：非法字符 / 保留名 / 尾点空格 → 视为无效（返回空串） */
export function normalizeBatchDirSegment(value: unknown): string {
  const segment = coerceOpcFileNameString(value);
  if (!segment) return "";
  if (segment === "." || segment === "..") return "";
  if (/[<>:"|?*\x00-\x1f\\/]/.test(segment)) return "";
  if (/[. ]$/.test(segment)) return "";
  if (WINDOWS_RESERVED_DIR_NAMES.test(segment)) return "";
  return segment;
}

/** 本机绝对路径：Windows 盘符 / UNC / POSIX（开发机） */
export function isAbsoluteLocalDir(p: string): boolean {
  const s = (p || "").trim();
  if (!s) return false;
  if (/^[A-Za-z]:[\\/]/.test(s)) return true;
  if (/^\\\\[^\\/]/.test(s)) return true;
  return s.startsWith("/");
}

const BATCH_NO_SOURCE_LABEL: Record<BatchNoSource, string> = {
  fileName: "结批文件名 OPC 批号变量",
  exportDir: "保存目录 OPC 批号变量",
};

export async function resolveReportOutputTarget(opts: {
  reportKind: ReportKind;
  nonBatchOutputDir?: string | null;
  prefs: ReportGeneratorPrefs;
}): Promise<ResolvedReportOutputTarget> {
  if (opts.reportKind === "nonBatch") {
    const dir = String(opts.nonBatchOutputDir || "").trim();
    if (!dir) {
      return {
        ok: false,
        kind: "nonBatch",
        error: "非批次模版未配置「目标文件夹」，请在模版编辑器中填写本机绝对路径",
      };
    }
    if (!isAbsoluteLocalDir(dir)) {
      return {
        ok: false,
        kind: "nonBatch",
        error: `非批次「目标文件夹」必须是本机绝对路径（如 D:\\Reports\\Daily），当前配置：${dir}`,
      };
    }
    return { ok: true, kind: "nonBatch", dir };
  }

  const prefs = opts.prefs;
  const root = String(prefs.autoExportDir || "").trim();
  if (!root) {
    return {
      ok: false,
      kind: "batch",
      error: "批次导出需要先在「生成报表」配置保存文件夹（导出根目录）",
    };
  }

  const candidates: { serverId: string; nodeId: string; from: BatchNoSource }[] = [];
  const fileSrv = (prefs.autoFileNameOpcServerId || "").trim();
  const fileNode = (prefs.autoFileNameOpcNodeId || "").trim();
  if (fileSrv && fileNode) candidates.push({ serverId: fileSrv, nodeId: fileNode, from: "fileName" });
  const dirSrv = (prefs.autoExportDirOpcServerId || "").trim();
  const dirNode = (prefs.autoExportDirOpcNodeId || "").trim();
  if (dirSrv && dirNode) candidates.push({ serverId: dirSrv, nodeId: dirNode, from: "exportDir" });

  if (!candidates.length) {
    return {
      ok: false,
      kind: "batch",
      error: "批次导出需要批号：请在「生成报表」绑定结批文件名或保存目录的 OPC 批号变量（String）",
    };
  }

  const failures: string[] = [];
  for (const c of candidates) {
    const read = await readSavedOpcStringValue(c.serverId, c.nodeId);
    if (!read.ok) {
      failures.push(`${BATCH_NO_SOURCE_LABEL[c.from]}读取失败（${read.message || "未知"}）`);
      continue;
    }
    const segment = normalizeBatchDirSegment(read.value);
    if (!segment) {
      failures.push(`${BATCH_NO_SOURCE_LABEL[c.from]}为空或含非法字符`);
      continue;
    }
    return {
      ok: true,
      kind: "batch",
      dir: joinDirSegment(root, segment),
      batchNo: segment,
      batchNoSource: c.from,
    };
  }

  return {
    ok: false,
    kind: "batch",
    error: `无有效批号，已禁止批次导出：${failures.join("；")}`,
  };
}
