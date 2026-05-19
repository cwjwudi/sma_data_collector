import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";
import { coerceOpcPathString, readSavedOpcNodeValue } from "@/lib/opcua-string-variables";

/** 自动导出文件名：勾选片段 或 OPC String + 随机哈希 */
export type AutoFileNameSource = "segments" | "opcua";

export type AutoFileNameSegment = "name" | "time" | "ts" | "hash";

export const AUTO_FILE_NAME_SEGMENT_OPTIONS: { id: AutoFileNameSegment; label: string; hint: string }[] = [
  { id: "name", label: "模版名称", hint: "当前选中模版的名称（非法文件名字符会替换为 _）" },
  { id: "time", label: "时间", hint: "yyyy-MM-dd_HH-mm-ss，便于阅读" },
  { id: "ts", label: "时间戳", hint: "yyyyMMdd_HHmmss，紧凑无分隔" },
  { id: "hash", label: "随机哈希", hint: "8 位十六进制，降低重名概率" },
];

const DEFAULT_SEGMENTS: AutoFileNameSegment[] = ["name", "ts", "hash"];

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

function segmentValue(seg: AutoFileNameSegment, templateName: string): string {
  switch (seg) {
    case "name":
      return sanitizeFileNamePart(templateName) || "report";
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
): string {
  const order: AutoFileNameSegment[] = ["name", "time", "ts", "hash"];
  const picked = order.filter((s) => segments.includes(s));
  const parts = picked.map((s) => segmentValue(s, templateName)).filter(Boolean);
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
  if (pattern.includes("{time}")) segs.push("time");
  if (pattern.includes("{ts}")) segs.push("ts");
  if (pattern.includes("{hash}")) segs.push("hash");
  return segs.length ? segs : defaultAutoFileNameSegments();
}

export function isAutoFileNameSegment(v: unknown): v is AutoFileNameSegment {
  return v === "name" || v === "time" || v === "ts" || v === "hash";
}

export function normalizeAutoFileNameSegments(raw: unknown): AutoFileNameSegment[] {
  if (!Array.isArray(raw)) return defaultAutoFileNameSegments();
  const out: AutoFileNameSegment[] = [];
  for (const x of raw) {
    if (isAutoFileNameSegment(x) && !out.includes(x)) out.push(x);
  }
  return out.length ? out : defaultAutoFileNameSegments();
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

  if (prefs.autoFileNameSource === "opcua") {
    const srv = (prefs.autoFileNameOpcServerId || "").trim();
    const nodeId = (prefs.autoFileNameOpcNodeId || "").trim();
    const hash = randomExportHash();
    if (!srv || !nodeId) {
      const base = buildSegmentsFileName(
        prefs.autoFileNameSegments?.length ? prefs.autoFileNameSegments : ["name", "hash"],
        safeName,
        prefs.autoFileNameSeparator,
      );
      return { base, note: "未绑定 OPC 文件名字段，已用勾选片段+哈希" };
    }
    const read = await readSavedOpcNodeValue(srv, nodeId);
    if (!read.ok) {
      const base = buildSegmentsFileName(["name", "ts", "hash"], safeName, prefs.autoFileNameSeparator);
      return { base, note: `OPC 文件名读取失败（${read.message || "未知"}），已回退默认规则` };
    }
    let stem = sanitizeFileNamePart(coerceOpcPathString(read.value));
    if (!stem) {
      const base = buildSegmentsFileName(["name", "ts", "hash"], safeName, prefs.autoFileNameSeparator);
      return { base, note: "OPC 文件名为空，已回退默认规则" };
    }
    if (stem.toLowerCase().endsWith(".pdf")) stem = stem.slice(0, -4);
    const sep = normalizeSeparator(prefs.autoFileNameSeparator);
    let base = `${stem}${sep}${hash}.pdf`;
    base = sanitizeFileNamePart(base.replace(/\.pdf$/i, "")) + ".pdf";
    return { base };
  }

  return {
    base: buildSegmentsFileName(
      normalizeAutoFileNameSegments(prefs.autoFileNameSegments),
      safeName,
      prefs.autoFileNameSeparator,
    ),
  };
}

/** 仅用于界面预览（同步，OPC 模式显示占位） */
export function previewAutoExportFileName(prefs: ReportGeneratorPrefs, templateName: string): string {
  const safeName = sanitizeFileNamePart(templateName) || "模版名";
  if (prefs.autoFileNameSource === "opcua") {
    const sep = normalizeSeparator(prefs.autoFileNameSeparator);
    return `OPC基名${sep}a1b2c3d4.pdf`;
  }
  const segs = normalizeAutoFileNameSegments(prefs.autoFileNameSegments);
  const order: AutoFileNameSegment[] = ["name", "time", "ts", "hash"];
  const parts = order
    .filter((s) => segs.includes(s))
    .map((s) => {
      if (s === "name") return safeName;
      if (s === "time") return formatExportTime();
      if (s === "ts") return formatExportTs();
      return "a1b2c3d4";
    });
  if (!parts.length) parts.push(safeName, formatExportTs(), "a1b2c3d4");
  let base = parts.join(normalizeSeparator(prefs.autoFileNameSeparator));
  if (!base.toLowerCase().endsWith(".pdf")) base += ".pdf";
  return base;
}
