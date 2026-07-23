import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const launch = require("../../electron/launch.cjs") as {
  quoteWinArg: (v: string) => string;
  formatQuotedLaunchCommand: (execPath: string, args?: string[]) => string;
  parseRunKeyOutput: (stdout: string) => { name: string; data: string }[];
  listWindowsRunEntries: () => { name: string; data: string }[];
  removeLegacyRunDuplicates: (execPath: string) => string[];
  normalizeSettings: (raw: unknown) => {
    openAtLogin: boolean;
    silentStart: boolean;
    exportOverlayEnabled: boolean;
  };
  DEFAULTS: { openAtLogin: boolean; silentStart: boolean; exportOverlayEnabled: boolean };
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

  it("parseRunKeyOutput parses value names with spaces", () => {
    const stdout = [
      "",
      "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      '    Report Editor AI    REG_SZ    "C:\\Programs\\Report Editor AI.exe"',
      "    com.brteam.sd_sma.report_editor_ai    REG_SZ    \"C:\\Programs\\Report Editor AI.exe\" --silent-start",
      "    ctfmon    REG_SZ    C:\\WINDOWS\\system32\\ctfmon.exe",
      "",
    ].join("\r\n");
    const entries = launch.parseRunKeyOutput(stdout);
    expect(entries).toEqual([
      { name: "Report Editor AI", data: '"C:\\Programs\\Report Editor AI.exe"' },
      {
        name: "com.brteam.sd_sma.report_editor_ai",
        data: '"C:\\Programs\\Report Editor AI.exe" --silent-start',
      },
      { name: "ctfmon", data: "C:\\WINDOWS\\system32\\ctfmon.exe" },
    ]);
  });

  it("listWindowsRunEntries/removeLegacyRunDuplicates are no-ops off Windows", () => {
    if (process.platform === "win32") return;
    expect(launch.listWindowsRunEntries()).toEqual([]);
    expect(launch.removeLegacyRunDuplicates("C:\\x\\Report Editor AI.exe")).toEqual([]);
  });

  it("039：导出遮罩默认开启，历史配置缺字段视为开、显式关闭保留", () => {
    expect(launch.DEFAULTS.exportOverlayEnabled).toBe(true);
    // 历史 launch-settings.json 无此字段 → 兜底遮罩默认可用
    expect(launch.normalizeSettings({ openAtLogin: true }).exportOverlayEnabled).toBe(true);
    expect(launch.normalizeSettings({}).exportOverlayEnabled).toBe(true);
    // 现场显式关闭必须保留
    expect(launch.normalizeSettings({ exportOverlayEnabled: false }).exportOverlayEnabled).toBe(false);
    expect(launch.normalizeSettings({ exportOverlayEnabled: true }).exportOverlayEnabled).toBe(true);
  });
});
