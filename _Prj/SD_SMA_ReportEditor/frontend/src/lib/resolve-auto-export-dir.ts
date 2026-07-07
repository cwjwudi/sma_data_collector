import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import { coerceOpcFileNameString, readSavedOpcStringValue } from "@/lib/opcua-string-variables";

export type ResolvedExportDirSource = "default" | "opcua" | "opcua-fallback" | "none";

export type ResolvedExportDir = {
  dir: string;
  source: ResolvedExportDirSource;
  note?: string;
};

const WINDOWS_RESERVED_DIR_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function joinDirSegment(baseDir: string, segment: string): string {
  const cleanBase = baseDir.trim().replace(/[\\/]+$/, "");
  const separator = cleanBase.includes("\\") && !cleanBase.includes("/") ? "\\" : "/";
  return `${cleanBase}${separator}${segment}`;
}

function normalizeOpcExportDirSegment(value: unknown): string {
  const segment = coerceOpcFileNameString(value);
  if (!segment) return "";
  if (segment === "." || segment === "..") return "";
  if (/[<>:"|?*\x00-\x1f\\/]/.test(segment)) return "";
  if (/[. ]$/.test(segment)) return "";
  if (WINDOWS_RESERVED_DIR_NAMES.test(segment)) return "";
  return segment;
}

export async function resolveAutoExportDir(prefs: ReportGeneratorPrefs): Promise<ResolvedExportDir> {
  const fallback = (prefs.autoExportDir || "").trim();
  if (prefs.autoExportDirSource !== "opcua") {
    return fallback
      ? { dir: fallback, source: "default" }
      : { dir: "", source: "none", note: "未选择导出保存文件夹" };
  }

  const srv = (prefs.autoExportDirOpcServerId || "").trim();
  const nodeId = (prefs.autoExportDirOpcNodeId || "").trim();
  if (!srv || !nodeId) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "未绑定 OPC 目录变量，已使用保底目录",
        }
      : { dir: "", source: "none", note: "未绑定 OPC 目录变量，且未配置保底目录" };
  }

  const read = await readSavedOpcStringValue(srv, nodeId);
  if (!read.ok) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: `OPC 目录变量读取失败（${read.message || "未知"}），已使用保底目录`,
        }
      : { dir: "", source: "none", note: read.message || "OPC 目录变量读取失败" };
  }

  const segment = normalizeOpcExportDirSegment(read.value);
  if (!segment) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "OPC 目录变量为空或含非法字符，已使用保底目录",
        }
      : { dir: "", source: "none", note: "OPC 目录变量为空或含非法字符" };
  }

  if (!fallback) {
    return { dir: "", source: "none", note: "已读取 OPC 目录变量，但缺少保底目录无法拼接完整路径" };
  }

  return { dir: joinDirSegment(fallback, segment), source: "opcua" };
}
