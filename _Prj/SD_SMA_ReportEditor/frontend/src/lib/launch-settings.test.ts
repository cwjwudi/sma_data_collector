import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const launch = require("../../electron/launch.cjs") as {
  quoteWinArg: (v: string) => string;
  formatQuotedLaunchCommand: (execPath: string, args?: string[]) => string;
  SILENT_START_ARG: string;
  LOGIN_ITEM_NAME: string;
};

describe("launch.cjs (037)", () => {
  it("quoteWinArg wraps paths with spaces", () => {
    expect(launch.quoteWinArg(`C:\\Programs\\Report Editor AI.exe`)).toBe(
      `"C:\\Programs\\Report Editor AI.exe"`,
    );
    expect(launch.quoteWinArg(`"already"`)).toBe(`"already"`);
  });

  it("formatQuotedLaunchCommand always quotes exe and appends silent arg", () => {
    const exe = `C:\\Users\\qih\\AppData\\Local\\Programs\\ReportEditorAI\\Report Editor AI.exe`;
    expect(launch.formatQuotedLaunchCommand(exe)).toBe(`"${exe}"`);
    expect(launch.formatQuotedLaunchCommand(exe, [launch.SILENT_START_ARG])).toBe(
      `"${exe}" ${launch.SILENT_START_ARG}`,
    );
  });

  it("LOGIN_ITEM_NAME matches appId", () => {
    expect(launch.LOGIN_ITEM_NAME).toBe("com.brteam.sd_sma.report_editor_ai");
  });
});
