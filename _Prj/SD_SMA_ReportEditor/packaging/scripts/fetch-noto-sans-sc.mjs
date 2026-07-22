/**
 * @deprecated 请用 fetch-bundled-fonts.mjs（Noto + 朱雀仿宋）。
 * 保留本入口以免旧文档/脚本断链。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const next = path.join(here, "fetch-bundled-fonts.mjs");
const child = spawn(process.execPath, [next], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
