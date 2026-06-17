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
      : { dir: "", source: "none", note: "No export directory selected" };
  }

  const srv = (prefs.autoExportDirOpcServerId || "").trim();
  const nodeId = (prefs.autoExportDirOpcNodeId || "").trim();
  if (!srv || !nodeId) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "No OPC directory variable is bound; using fallback directory",
        }
      : { dir: "", source: "none", note: "No OPC directory variable or fallback directory configured" };
  }

  const read = await readSavedOpcStringValue(srv, nodeId);
  if (!read.ok) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: `Failed to read OPC directory variable (${read.message || "unknown"}); using fallback directory`,
        }
      : { dir: "", source: "none", note: read.message || "Failed to read OPC directory variable" };
  }

  const segment = normalizeOpcExportDirSegment(read.value);
  if (!segment) {
    return fallback
      ? {
          dir: fallback,
          source: "opcua-fallback",
          note: "OPC directory segment is empty or invalid; using fallback directory",
        }
      : { dir: "", source: "none", note: "OPC directory segment is empty or invalid" };
  }

  if (!fallback) {
    return { dir: "", source: "none", note: "Missing fallback directory for OPC directory segment" };
  }

  return { dir: joinDirSegment(fallback, segment), source: "opcua" };
}
