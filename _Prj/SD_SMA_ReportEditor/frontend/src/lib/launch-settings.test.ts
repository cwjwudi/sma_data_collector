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
  decodeWindowsConsole: (data: Buffer | string | null | undefined) => string;
  isRegNotFoundMessage: (text: string) => boolean;
  patchTouchesLoginItem: (patch: Record<string, unknown> | null | undefined) => boolean;
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

  it("039b：仅改遮罩开关不视为触及登录项", () => {
    expect(launch.patchTouchesLoginItem({ exportOverlayEnabled: false })).toBe(false);
    expect(launch.patchTouchesLoginItem({ openAtLogin: true })).toBe(true);
    expect(launch.patchTouchesLoginItem({ silentStart: true })).toBe(true);
    expect(launch.patchTouchesLoginItem({})).toBe(false);
    expect(launch.patchTouchesLoginItem(null)).toBe(false);
  });

  it("037c：GBK reg 报错可解码，且「找不到」判为幂等成功", () => {
    // 「错误：系统找不到指定的注册表项或值。」的 GBK 字节
    const gbk = Buffer.from([
      0xb4, 0xed, 0xce, 0xf3, 0xa3, 0xba, 0xcf, 0xb5, 0xcd, 0xb3, 0xd5, 0xd2, 0xb2, 0xbb, 0xb5, 0xbd,
      0xd6, 0xb8, 0xb6, 0xa8, 0xb5, 0xc4, 0xd7, 0xa2, 0xb2, 0xe1, 0xb1, 0xed, 0xcf, 0xee, 0xbb, 0xf2,
      0xd6, 0xb5, 0xa1, 0xa3,
    ]);
    const text = launch.decodeWindowsConsole(gbk);
    expect(text).toContain("找不到");
    expect(text).toContain("注册表");
    expect(launch.isRegNotFoundMessage(text)).toBe(true);
    expect(
      launch.isRegNotFoundMessage(
        "ERROR: The system was unable to find the specified registry key or value.",
      ),
    ).toBe(true);
    // 误按 UTF-8 解码的乱码不应再依赖「找不到」字面；英文仍可识别
    expect(launch.isRegNotFoundMessage("unable to find the specified registry key")).toBe(true);
  });
});
