import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mod = require(join(here, "../../electron/removable-volumes.cjs")) as {
  parseWinVolumeLines: (text: string) => Array<{ path: string; label: string; kind: string }>;
};

describe("parseWinVolumeLines", () => {
  it("解析 Removable / USB 行并规范为盘符\\", () => {
    const rows = mod.parseWinVolumeLines("E:|KINGSTON|removable\nF:|Backup|usb\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ path: "E:\\", label: "KINGSTON", kind: "removable" });
    expect(rows[1]).toMatchObject({ path: "F:\\", label: "Backup", kind: "usb" });
  });

  it("去重并忽略非法行", () => {
    const rows = mod.parseWinVolumeLines("E:|A|removable\ne:|B|usb\nnot-a-drive|x|y\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("A");
  });

  it("单字母盘符补冒号", () => {
    const rows = mod.parseWinVolumeLines("G|Stick|new");
    expect(rows[0]?.path).toBe("G:\\");
    expect(rows[0]?.kind).toBe("new");
  });
});
