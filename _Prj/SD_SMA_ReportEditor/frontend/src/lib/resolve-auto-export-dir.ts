import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import { coerceOpcPathString, readSavedOpcNodeValue } from "@/lib/opcua-string-variables";

export type ResolvedExportDirSource = "default" | "opcua" | "opcua-fallback" | "none";

export type ResolvedExportDir = {
  dir: string;
  source: ResolvedExportDirSource;
  note?: string;
};

/** 解析自动导出目标文件夹：OPC 模式在空/失败时回退默认文件夹。 */
export async function resolveAutoExportDir(prefs: ReportGeneratorPrefs): Promise<ResolvedExportDir> {
  const fallback = (prefs.autoExportDir || "").trim();
  if (prefs.autoExportDirSource !== "opcua") {
    return fallback
      ? { dir: fallback, source: "default" }
      : { dir: "", source: "none", note: "未选择导出目录" };
  }

  const srv = (prefs.autoExportDirOpcServerId || "").trim();
  const nodeId = (prefs.autoExportDirOpcNodeId || "").trim();
  if (!srv || !nodeId) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "未绑定 OPC 路径变量，已使用保底目录",
        }
      : { dir: "", source: "none", note: "未配置 OPC 路径变量且无保底目录" };
  }

  const read = await readSavedOpcNodeValue(srv, nodeId);
  if (!read.ok) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: `OPC 读取失败（${read.message || "未知"}），已使用保底目录`,
        }
      : { dir: "", source: "none", note: read.message || "OPC 读取失败" };
  }

  const path = coerceOpcPathString(read.value);
  if (!path) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "OPC 路径为空，已使用保底目录",
        }
      : { dir: "", source: "none", note: "OPC 路径变量值为空" };
  }

  return { dir: path, source: "opcua" };
}
