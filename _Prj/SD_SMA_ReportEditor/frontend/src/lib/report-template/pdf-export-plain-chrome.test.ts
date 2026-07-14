import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const chromeVue = readFileSync(
  join(root, "components/report-template/MiniPreviewChrome.vue"),
  "utf8",
);
const miniPageVue = readFileSync(
  join(root, "components/report-template/TemplateMiniPage.vue"),
  "utf8",
);
const stackVue = readFileSync(
  join(root, "components/report-template/TemplateExportPreviewStack.vue"),
  "utf8",
);
const pdfViewVue = readFileSync(join(root, "views/PdfExportView.vue"), "utf8");

describe("PDF export strips MiniPreviewChrome role borders (009)", () => {
  it("MiniPreviewChrome exposes plain mode class + CSS", () => {
    expect(chromeVue).toMatch(/mpc--plain/);
    expect(chromeVue).toMatch(/plain\?:\s*boolean/);
    expect(chromeVue).toMatch(/\.mpc--plain\s*\{[^}]*outline:\s*none/s);
    expect(chromeVue).toMatch(/\.mpc--plain[^{]*:deep\(\.mpp-paper\)[^{]*\{[^}]*border:\s*none/s);
  });

  it("export stack passes plainChrome when pdfExportOmitCaptions", () => {
    expect(miniPageVue).toMatch(/plainChrome\?:\s*boolean/);
    expect(miniPageVue).toMatch(/:plain="plainChrome"/);
    expect(stackVue).toMatch(/:plain-chrome="pdfExportOmitCaptions"/);
  });

  it("PdfExportView print CSS clears mpc outline / paper role borders", () => {
    expect(pdfViewVue).toMatch(/\.pdf-export-root\s+\.mpc[\s\S]*outline:\s*none\s*!important/);
    expect(pdfViewVue).toMatch(/\.pdf-export-root\s+\.mpp-paper[\s\S]*border:\s*none\s*!important/);
    expect(pdfViewVue).toMatch(/box-shadow:\s*none\s*!important/);
  });
});
