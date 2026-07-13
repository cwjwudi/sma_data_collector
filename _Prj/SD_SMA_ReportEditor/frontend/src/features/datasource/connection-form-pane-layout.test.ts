import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const formPaneCss = readFileSync(join(here, "connection-form-pane.css"), "utf8");
const connectionManagerVue = readFileSync(
  join(here, "database-workbench/connection-manager/ConnectionManager.vue"),
  "utf8",
);

describe("connection-form-pane layout contracts (lock hint must not push actions away)", () => {
  it("B1: pane remains a column flex container", () => {
    expect(formPaneCss).toMatch(/\.conn-form-pane\s*\{[^}]*flex-direction:\s*column/s);
  });

  it("B2: scrollable body + non-shrinking actions (actions outside scroll)", () => {
    expect(formPaneCss).toMatch(/\.conn-form-pane__body\s*\{[^}]*overflow-y:\s*auto/s);
    expect(formPaneCss).toMatch(/\.conn-form-pane__body\s*\{[^}]*min-height:\s*0/s);
    expect(formPaneCss).toMatch(/\.conn-form-pane__actions\s*\{[^}]*flex-shrink:\s*0/s);
  });

  it("B3: ConnectionManager uses body + actions structure classes", () => {
    expect(connectionManagerVue).toMatch(/conn-form-pane__body/);
    expect(connectionManagerVue).toMatch(/conn-form-pane__actions/);
  });

  it("B4: does not force height:100% on conn-form-pane (004 regression)", () => {
    expect(formPaneCss).not.toMatch(/\.conn-form-pane\s*\{[^}]*height:\s*100%/s);
    expect(formPaneCss).toMatch(/\.conn-form-pane\s*\{[^}]*min-height:\s*\d+px/s);
  });

  it("pane clips overflow so spilled buttons stay inside bordered area", () => {
    expect(formPaneCss).toMatch(/\.conn-form-pane\s*\{[^}]*overflow:\s*hidden/s);
  });
});
