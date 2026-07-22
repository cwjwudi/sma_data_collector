/**
 * Download bundled OFL CJK fonts into frontend/resources/fonts/.
 * - Noto Sans SC Regular (OTF)
 * - Zhuque Fangsong Regular (TTF，映射 UI 族名 FangSong；非微软仿宋)
 *
 * Override URLs: NOTO_SC_URL / ZHUQUE_FANGSONG_URL
 * Skip existing files.
 */
import { createWriteStream } from "node:fs";
import { mkdir, access, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../frontend/resources/fonts");

const NOTO_URL =
  process.env.NOTO_SC_URL ||
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf";
const NOTO_FILE = "NotoSansSC-Regular.otf";

const ZHUQUE_URL =
  process.env.ZHUQUE_FANGSONG_URL ||
  "https://github.com/TrionesType/zhuque/releases/download/v0.108/ZhuqueFangsong-v0.108.zip";
const ZHUQUE_FILE = "ZhuqueFangsong-Regular.ttf";

async function exists(fp) {
  try {
    await access(fp);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url, dest) {
  console.log(`[fetch-fonts] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`[fetch-fonts] wrote ${dest}`);
}

async function fetchNoto() {
  const outFile = path.join(outDir, NOTO_FILE);
  if (await exists(outFile)) {
    console.log(`[fetch-fonts] already exists: ${outFile}`);
    return;
  }
  await downloadTo(NOTO_URL, outFile);
}

async function unzipExtract(zipPath, destDir) {
  // Prefer system unzip; fallback to PowerShell Expand-Archive on Windows.
  try {
    await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
    return;
  } catch {
    /* try PowerShell */
  }
  await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ]);
}

async function fetchZhuque() {
  const outFile = path.join(outDir, ZHUQUE_FILE);
  if (await exists(outFile)) {
    console.log(`[fetch-fonts] already exists: ${outFile}`);
    return;
  }
  const tmp = await mkdtemp(path.join(tmpdir(), "zhuque-font-"));
  try {
    const zipPath = path.join(tmp, "zhuque.zip");
    await downloadTo(ZHUQUE_URL, zipPath);
    await unzipExtract(zipPath, tmp);
    const candidate = path.join(tmp, ZHUQUE_FILE);
    if (!(await exists(candidate))) {
      throw new Error(`zip missing ${ZHUQUE_FILE}`);
    }
    const buf = await readFile(candidate);
    if (buf.length < 1000) throw new Error("Zhuque font too small");
    await writeFile(outFile, buf);
    console.log(`[fetch-fonts] wrote ${outFile} (${buf.length} bytes)`);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await fetchNoto();
  await fetchZhuque();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
