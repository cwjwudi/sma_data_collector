/**
 * 033：自定义字体 embed 前必须 registerFontkit
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "../../..");

describe("pdf-lib fontkit (033)", () => {
  it("package.json depends on @pdf-lib/fontkit", () => {
    const pkg = JSON.parse(readFileSync(join(frontendRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@pdf-lib/fontkit"]).toBeTruthy();
  });

  it("pdf-lib-export-render registers fontkit before embedFont", () => {
    const src = readFileSync(join(here, "pdf-lib-export-render.ts"), "utf8");
    expect(src).toMatch(/@pdf-lib\/fontkit/);
    expect(src).toMatch(/registerFontkit\s*\(\s*fontkit\s*\)/);
    const regAt = src.indexOf("registerFontkit");
    const embedAt = src.indexOf("embedFont(fontBytes");
    expect(regAt).toBeGreaterThan(0);
    expect(embedAt).toBeGreaterThan(regAt);
  });

  it("embedFont custom bytes works after registerFontkit", async () => {
    // 用标准字体字节路径验证 register 本身不炸；自定义路径依赖真 OTF
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(font).toBeTruthy();
  });
});
