import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPaperPageCssPx, PAPER_PRESETS } from "./paper";

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

describe("PDF export chrome (019 fill + 021 role borders)", () => {
  it("U8: MiniPreviewChrome still exposes plain mode API", () => {
    expect(chromeVue).toMatch(/mpc--plain/);
    expect(chromeVue).toMatch(/plain\?:\s*boolean/);
    expect(chromeVue).toMatch(/\.mpc--plain\s*\{[^}]*outline:\s*none/s);
  });

  it("U5/U6: omit captions ≠ force plain; exactPageFit on export", () => {
    expect(miniPageVue).toMatch(/exactPageFit\?:\s*boolean/);
    expect(miniPageVue).toMatch(/plainChrome\?:\s*boolean/);
    expect(miniPageVue).toMatch(/:plain="plainChrome"/);
    expect(stackVue).toMatch(/:exact-page-fit="pdfExportOmitCaptions"/);
    expect(stackVue).toMatch(/:plain-chrome="false"/);
    expect(stackVue).not.toMatch(/:plain-chrome="pdfExportOmitCaptions"/);
    expect(stackVue).toMatch(/v-if="!pdfExportOmitCaptions"/);
  });

  it("U3: PdfExportView no longer subtracts slackPx 28 from max height", () => {
    expect(pdfViewVue).not.toMatch(/slackPx\s*=\s*28/);
    expect(pdfViewVue).not.toMatch(/heightPx\s*-\s*slackPx/);
    expect(pdfViewVue).toMatch(/return Math\.max\(200,\s*heightPx\)/);
  });

  it("U4: exactPageFit disables scaledSize +3", () => {
    expect(miniPageVue).toMatch(/exactPageFit\s*\?\s*0\s*:\s*3/);
  });

  it("U7: print CSS keeps role borders (no blanket border/outline none on mpc paper)", () => {
    // 仍清卡片 padding / 标签；不再用 border:none !important 抹掉角色粗边
    expect(pdfViewVue).toMatch(/\.pdf-export-root\s+\.tep-card[\s\S]*padding:\s*0\s*!important/);
    expect(pdfViewVue).toMatch(/\.pdf-export-root\s+\.mpc-tag[\s\S]*display:\s*none\s*!important/);
    expect(pdfViewVue).not.toMatch(
      /\.pdf-export-root\s+\.mpc[\s\S]*outline:\s*none\s*!important/,
    );
    expect(pdfViewVue).not.toMatch(
      /\.pdf-export-root\s+\.mpp-paper[\s\S]*border:\s*none\s*!important/,
    );
  });

  it("U9: A4 portrait CSS px matches @page mm injection", () => {
    const { widthPx, heightPx } = getPaperPageCssPx("A4", "portrait");
    const d = PAPER_PRESETS.A4;
    expect(pdfViewVue).toMatch(/@page\s*\{\s*size:\s*\$\{wmm\}mm\s*\$\{hmm\}mm/);
    expect(widthPx).toBe(Math.round((d.widthMm * 96) / 25.4));
    expect(heightPx).toBe(Math.round((d.heightMm * 96) / 25.4));
  });
});
