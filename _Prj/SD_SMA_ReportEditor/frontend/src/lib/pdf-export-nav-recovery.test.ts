import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mod = require(join(here, "../../electron/pdf-export-nav-recovery.cjs")) as {
  isRecoverablePdfExportNavError: (err: unknown) => boolean;
};

describe("pdf-export-nav-recovery (033)", () => {
  it("treats ERR_FAILED (-2) as recoverable", () => {
    expect(mod.isRecoverablePdfExportNavError(new Error("ERR_FAILED (-2) loading '#/pdf-export'"))).toBe(
      true,
    );
    expect(mod.isRecoverablePdfExportNavError("net::ERR_FAILED")).toBe(true);
    expect(mod.isRecoverablePdfExportNavError(new Error("ERR_ABORTED"))).toBe(true);
  });

  it("does not recover unrelated errors", () => {
    expect(mod.isRecoverablePdfExportNavError(new Error("PDF 渲染超时：渲染窗口约 2 分钟无响应"))).toBe(
      false,
    );
    expect(mod.isRecoverablePdfExportNavError(new Error("导出已取消"))).toBe(false);
  });
});
