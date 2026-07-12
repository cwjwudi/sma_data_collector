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

  it("allows all warn and info issues to be dismissed; errors stay fixed", () => {
    expect(isAssetHealthIssueDismissible(sample)).toBe(true);
    expect(
      isAssetHealthIssueDismissible({
        ...sample,
        kind: "missing_default_database",
        message: "连接未设置默认数据库，标量/SQL 可能报 1046",
      }),
    ).toBe(true);
    expect(isAssetHealthIssueDismissible({ ...sample, kind: "other" })).toBe(true);
    expect(isAssetHealthIssueDismissible({ ...sample, severity: "info", kind: "hint" })).toBe(true);
    expect(isAssetHealthIssueDismissible({ ...sample, severity: "error" })).toBe(false);
  });

  it("persists ignore fingerprints and filters issues", () => {
    const ignored = ignoreAssetHealthIssue(sample);
    expect(ignored.has(assetHealthIssueFingerprint(sample))).toBe(true);
    expect(filterVisibleAssetHealthIssues([sample], ignored)).toHaveLength(0);
    expect(loadIgnoredAssetHealthFingerprints().has(assetHealthIssueFingerprint(sample))).toBe(true);
  });
});
