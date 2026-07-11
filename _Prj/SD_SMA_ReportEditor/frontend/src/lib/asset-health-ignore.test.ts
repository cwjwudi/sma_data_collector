import { describe, expect, it, beforeEach } from "vitest";
import {
  assetHealthIssueFingerprint,
  clearIgnoredAssetHealthIssues,
  filterVisibleAssetHealthIssues,
  ignoreAssetHealthIssue,
  isAssetHealthIssueDismissible,
  loadIgnoredAssetHealthFingerprints,
} from "@/lib/asset-health-ignore";
import type { AssetHealthIssue } from "@/api/assets";

const sample: AssetHealthIssue = {
  severity: "warn",
  kind: "missing_db",
  message: "绑定的数据库连接不存在",
  assetKind: "template",
  assetId: "t1",
  assetName: "T",
  meta: { connection_id: "c1" },
};

describe("asset-health-ignore", () => {
  beforeEach(() => {
    clearIgnoredAssetHealthIssues();
  });

  it("marks missing_db warn as dismissible", () => {
    expect(isAssetHealthIssueDismissible(sample)).toBe(true);
    expect(isAssetHealthIssueDismissible({ ...sample, severity: "error" })).toBe(false);
    expect(isAssetHealthIssueDismissible({ ...sample, kind: "other" })).toBe(false);
  });

  it("persists ignore fingerprints and filters issues", () => {
    const ignored = ignoreAssetHealthIssue(sample);
    expect(ignored.has(assetHealthIssueFingerprint(sample))).toBe(true);
    expect(filterVisibleAssetHealthIssues([sample], ignored)).toHaveLength(0);
    expect(loadIgnoredAssetHealthFingerprints().has(assetHealthIssueFingerprint(sample))).toBe(true);
  });
});
