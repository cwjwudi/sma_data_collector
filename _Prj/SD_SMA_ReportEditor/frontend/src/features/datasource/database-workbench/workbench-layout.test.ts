import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { workbenchMainLayoutClass } from "./workbench-layout";

const here = dirname(fileURLToPath(import.meta.url));
const workbenchVue = readFileSync(join(here, "DatabaseWorkbench.vue"), "utf8");
const formPaneCss = readFileSync(join(here, "../connection-form-pane.css"), "utf8");
const mainLayoutVue = readFileSync(join(here, "../../../layouts/MainLayout.vue"), "utf8");

describe("workbenchMainLayoutClass", () => {
  it("uses solo layout when no active connection (empty / creating)", () => {
    expect(workbenchMainLayoutClass(false)).toBe("main main--solo");
  });

  it("uses full three-pane main when a connection is active", () => {
    expect(workbenchMainLayoutClass(true)).toBe("main");
  });
});

describe("DatabaseWorkbench layout CSS contracts (anti-blank)", () => {
  it("binds main class via workbenchMainLayoutClass(!!activeConnId)", () => {
    expect(workbenchVue).toMatch(/workbenchMainLayoutClass\(\s*!!\s*activeConnId\s*\)/);
  });

  it("defines main--solo as single column with real min-height (not crushed to 0)", () => {
    expect(workbenchVue).toMatch(/\.main--solo\s*\{[^}]*grid-template-columns:\s*minmax\(/s);
    expect(workbenchVue).toMatch(/\.main--solo\s*\{[^}]*min-height:\s*(3\d{2}|[4-9]\d{2})px/s);
    expect(workbenchVue).toMatch(/\.main--solo\s*>\s*\*\s*\{[^}]*min-height:\s*auto/s);
  });

  it("does not force height:100% on conn-form-pane (circular % height → invisible)", () => {
    expect(formPaneCss).not.toMatch(/\.conn-form-pane\s*\{[^}]*height:\s*100%/s);
    expect(formPaneCss).toMatch(/\.conn-form-pane\s*\{[^}]*min-height:\s*\d+px/s);
  });

  it("page-fill-height keeps a floor min-height under content-scroll (keep-alive safe)", () => {
    expect(mainLayoutVue).toMatch(
      /\.content-scroll\s+\.page-fill-height[\s\S]*?min-height:\s*max\(\s*100%\s*,\s*\d+px\s*\)/m,
    );
  });
});
