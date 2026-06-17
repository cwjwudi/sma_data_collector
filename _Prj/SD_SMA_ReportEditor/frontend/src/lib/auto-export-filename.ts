import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import { coerceOpcFileNameString, readSavedOpcStringValue } from "@/lib/opcua-string-variables";

/** 自动导出文件名：按勾选片段拼接，可包含 OPC UA String 变量 */
export type AutoFileNameSource = "segments" | "opcua";

export type AutoFileNameSegment = "name" | "opcua" | "time" | "ts" | "hash";

export const AUTO_FILE_NAME_SEGMENT_OPTIONS: { id: AutoFileNameSegment; label: string; hint: string }[] = [
  { id: "name", label: "模版名称", hint: "当前选中模版的名称（非法文件名字符会替换为 _）" },
  { id: "opcua", label: "OPC UA变量", hint: "读取绑定的 OPC UA String 变量，作为文件名片段拼接" },
  { id: "time", label: "时间", hint: "yyyy-MM-dd_HH-mm-ss，便于阅读" },
  { id: "ts", label: "时间戳", hint: "yyyyMMdd_HHmmss，紧凑无分隔" },
  { id: "hash", label: "随机哈希", hint: "8 位十六进制，降低重名概率" },
];

const DEFAULT_SEGMENTS: AutoFileNameSegment[] = ["name", "ts", "hash"];
const FILE_NAME_SEGMENT_ORDER: AutoFileNameSegment[] = ["name", "opcua", "time", "ts", "hash"];

export function defaultAutoFileNameSegments(): AutoFileNameSegment[] {
  return [...DEFAULT_SEGMENTS];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatExportTs(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

export function formatExportTime(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

export function randomExportHash(len = 8): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, len);
  }
  return Math.random().toString(16).slice(2, 2 + len);
}

export function sanitizeFileNamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

function normalizeSeparator(sep: string | undefined): string {
  const s = typeof sep === "string" ? sep : "_";
  if (!s) return "_";
  return s.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 8);
}

/** OPC 基名后追加时间戳与随机哈希（与片段规则中的 ts / hash 格式一致） */
export function appendOpcExportSuffix(stem: string, sep: string, appendHash: boolean): string {
  if (!appendHash) return stem;
  return `${stem}${sep}${formatExportTs()}${sep}${randomExportHash()}`;
}

export function legacyOpcAutoFileNameSegments(appendHash = true): AutoFileNameSegment[] {
  const segs: AutoFileNameSegment[] = ["name", "opcua"];
  if (appendHash) segs.push("ts", "hash");
  return segs;
}

export function withOpcuaFileNameSegment(segments: AutoFileNameSegment[]): AutoFileNameSegment[] {
  const out = normalizeAutoFileNameSegments(segments);
  if (out.includes("opcua")) return out;
  const nameIndex = out.indexOf("name");
  if (nameIndex < 0) return ["opcua", ...out];
  return [...out.slice(0, nameIndex + 1), "opcua", ...out.slice(nameIndex + 1)];
}

function segmentValue(seg: AutoFileNameSegment, templateName: string, opcValue = ""): string {
  switch (seg) {
    case "name":
      return sanitizeFileNamePart(templateName) || "report";
    case "opcua":
      return opcValue;
    case "time":
      return formatExportTime();
    case "ts":
      return formatExportTs();
    case "hash":
      return randomExportHash();
    default:
      return "";
  }
}

export function buildSegmentsFileName(
  segments: AutoFileNameSegment[],
  templateName: string,
  separator?: string,
  opcValue = "",
): string {
  const picked = FILE_NAME_SEGMENT_ORDER.filter((s) => segments.includes(s));
  const parts = picked.map((s) => segmentValue(s, templateName, opcValue)).filter(Boolean);
  if (!parts.length) {
    parts.push(sanitizeFileNamePart(templateName) || "report", formatExportTs(), randomExportHash());
  }
  let base = parts.join(normalizeSeparator(separator));
  if (!base.toLowerCase().endsWith(".pdf")) base += ".pdf";
  return base;
}

/** 从旧版 autoFilePattern 推断片段（加载偏好时） */
export function segmentsFromLegacyPattern(pattern: string): AutoFileNameSegment[] {
  const segs: AutoFileNameSegment[] = [];
  if (pattern.includes("{name}")) segs.push("name");
  if (pattern.includes("{opcua}")) segs.push("opcua");
  if (pattern.includes("{time}")) segs.push("time");
  if (pattern.includes("{ts}")) segs.push("ts");
  if (pattern.includes("{hash}")) segs.push("hash");
  return segs.length ? segs : defaultAutoFileNameSegments();
}

export function isAutoFileNameSegment(v: unknown): v is AutoFileNameSegment {
  return v === "name" || v === "opcua" || v === "time" || v === "ts" || v === "hash";
}

export function normalizeAutoFileNameSegments(raw: unknown): AutoFileNameSegment[] {
  if (!Array.isArray(raw)) return defaultAutoFileNameSegments();
  const out: AutoFileNameSegment[] = [];
  for (const x of raw) {
    if (isAutoFileNameSegment(x) && !out.includes(x)) out.push(x);
  }
  return out.length ? out : defaultAutoFileNameSegments();
}

export function effectiveAutoFileNameSegments(prefs: ReportGeneratorPrefs): AutoFileNameSegment[] {
  const segments = normalizeAutoFileNameSegments(prefs.autoFileNameSegments);
  if (prefs.autoFileNameSource === "opcua") {
    const out = withOpcuaFileNameSegment(segments);
    if (prefs.autoFileNameOpcAppendHash !== false) {
      if (!out.includes("ts")) out.push("ts");
      if (!out.includes("hash")) out.push("hash");
    }
    return out;
  }
  return segments;
}

export type BuiltAutoExportFileName = {
  base: string;
  note?: string;
};

/** 构建自动导出 PDF 文件名（含扩展名 .pdf） */
export async function buildAutoExportFileName(
  prefs: ReportGeneratorPrefs,
  templateName: string,
): Promise<BuiltAutoExportFileName> {
  const safeName = sanitizeFileNamePart(templateName) || "report";
  const segments = effectiveAutoFileNameSegments(prefs);
  let opcValue = "";
  let note = "";

  if (segments.includes("opcua")) {
    const srv = (prefs.autoFileNameOpcServerId || "").trim();
    const nodeId = (prefs.autoFileNameOpcNodeId || "").trim();
    if (!srv || !nodeId) {
      note = "未绑定 OPC 文件名变量，已跳过 OPC UA 变量片段";
    } else {
      const read = await readSavedOpcStringValue(srv, nodeId);
      if (!read.ok) {
        note = `OPC 文件名变量读取失败（${read.message || "未知"}），已跳过 OPC UA 变量片段`;
      } else {
        let stem = sanitizeFileNamePart(coerceOpcFileNameString(read.value));
        if (stem.toLowerCase().endsWith(".pdf")) stem = stem.slice(0, -4);
        if (stem) {
          opcValue = stem;
        } else {
          note = "OPC 文件名变量为空，已跳过 OPC UA 变量片段";
        }
      }
    }
  }

  return {
    base: buildSegmentsFileName(segments, safeName, prefs.autoFileNameSeparator, opcValue),
    note: note || undefined,
  };
}

/** 仅用于界面预览（同步，OPC 变量显示占位） */
export function previewAutoExportFileName(prefs: ReportGeneratorPrefs, templateName: string): string {
  const safeName = sanitizeFileNamePart(templateName) || "模版名";
  const segs = effectiveAutoFileNameSegments(prefs);
  const parts = FILE_NAME_SEGMENT_ORDER
    .filter((s) => segs.includes(s))
    .map((s) => {
      if (s === "name") return safeName;
      if (s === "opcua") return "OPC变量";
      if (s === "time") return formatExportTime();
      if (s === "ts") return formatExportTs();
      return "a1b2c3d4";
    });
  if (!parts.length) parts.push(safeName, formatExportTs(), "a1b2c3d4");
  let base = parts.join(normalizeSeparator(prefs.autoFileNameSeparator));
  if (!base.toLowerCase().endsWith(".pdf")) base += ".pdf";
  return base;
}
