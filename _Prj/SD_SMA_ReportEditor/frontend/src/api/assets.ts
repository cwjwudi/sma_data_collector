/** 资产健康扫描 API */
import { apiFetch } from "@/api/client.js";

export type AssetHealthSeverity = "error" | "warn" | "info";

export interface AssetHealthIssue {
  severity: AssetHealthSeverity;
  kind: string;
  message: string;
  assetKind: "template" | "layout" | string;
  assetId: string;
  assetName: string;
  hint?: string;
  meta?: Record<string, unknown>;
}

export interface AssetHealthScanResult {
  ok: boolean;
  scannedAt: string;
  templateCount: number;
  layoutCount: number;
  templatesWithIssues: number;
  layoutsWithIssues: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  issueCount: number;
  issues: AssetHealthIssue[];
}

export function fetchAssetHealthScan(): Promise<AssetHealthScanResult> {
  return apiFetch("/assets/health-scan") as Promise<AssetHealthScanResult>;
}
