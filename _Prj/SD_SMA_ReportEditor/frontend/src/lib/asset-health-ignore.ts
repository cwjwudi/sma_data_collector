/** 仪表盘资产健康问题：本机忽略（localStorage） */

import type { AssetHealthIssue } from "@/api/assets";

const STORAGE_KEY = "sd-sma-report-editor:ignored-asset-health-issues:v1";

/** localStorage 不可用时（如单测）退回内存 */
let memoryIgnored: Set<string> | null = null;

function storageAvailable(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const k = `${STORAGE_KEY}:probe`;
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function assetHealthIssueFingerprint(
  it: Pick<AssetHealthIssue, "assetKind" | "assetId" | "kind" | "meta">,
): string {
  const conn = it.meta && typeof it.meta.connection_id === "string" ? it.meta.connection_id : "";
  return `${it.assetKind}|${it.assetId}|${it.kind}|${conn}`;
}

/** 警告与提示均可忽略；错误不可忽略 */
export function isAssetHealthIssueDismissible(
  it: Pick<AssetHealthIssue, "kind" | "severity">,
): boolean {
  return it.severity === "warn" || it.severity === "info";
}

export function loadIgnoredAssetHealthFingerprints(): Set<string> {
  if (!storageAvailable()) {
    return new Set(memoryIgnored ?? []);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(memoryIgnored ?? []);
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set(memoryIgnored ?? []);
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set(memoryIgnored ?? []);
  }
}

export function saveIgnoredAssetHealthFingerprints(ids: Set<string>): void {
  memoryIgnored = new Set(ids);
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

export function ignoreAssetHealthIssue(it: AssetHealthIssue): Set<string> {
  const next = loadIgnoredAssetHealthFingerprints();
  next.add(assetHealthIssueFingerprint(it));
  saveIgnoredAssetHealthFingerprints(next);
  return next;
}

export function clearIgnoredAssetHealthIssues(): Set<string> {
  const empty = new Set<string>();
  saveIgnoredAssetHealthFingerprints(empty);
  return empty;
}

export function filterVisibleAssetHealthIssues(
  issues: AssetHealthIssue[],
  ignored: Set<string>,
): AssetHealthIssue[] {
  return issues.filter((it) => !ignored.has(assetHealthIssueFingerprint(it)));
}

export function recountAssetHealthSeverities(issues: AssetHealthIssue[]): {
  errorCount: number;
  warnCount: number;
  infoCount: number;
  issueCount: number;
} {
  let errorCount = 0;
  let warnCount = 0;
  let infoCount = 0;
  for (const it of issues) {
    if (it.severity === "error") errorCount += 1;
    else if (it.severity === "warn") warnCount += 1;
    else infoCount += 1;
  }
  return {
    errorCount,
    warnCount,
    infoCount,
    issueCount: issues.length,
  };
}
