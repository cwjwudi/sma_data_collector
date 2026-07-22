/**
 * Download bundled OFL CJK fonts into frontend/resources/fonts/.
 * - Noto Sans SC Regular（TTF：pdf-lib fontkit subset 可用；OTF/CFF 会乱码）
 * - Zhuque Fangsong Regular（TTF，映射 UI 族名 FangSong；非微软仿宋）
 *
 * Override URLs: NOTO_SC_TTF_URL / ZHUQUE_FANGSONG_URL
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

/** Variable TTF（TrueType）；pdf-lib subset 正常。静态实例化可选但非必需。 */
const NOTO_TTF_URL =
  process.env.NOTO_SC_TTF_URL ||
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf";
const NOTO_TTF_FILE = "NotoSansSC-Regular.ttf";

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

async function fetchNotoTtf() {
  const outFile = path.join(outDir, NOTO_TTF_FILE);
  if (await exists(outFile)) {
    console.log(`[fetch-fonts] already exists: ${outFile}`);
    return;
  }
  await downloadTo(NOTO_TTF_URL, outFile);
  const buf = await readFile(outFile);
  if (buf.length < 1000) throw new Error("Noto TTF too small");
  // TrueType 魔数 00010000 或 'true'；拒绝 OTTO/CFF
  const mag = buf.subarray(0, 4).toString("binary");
  const isTtf =
    (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) ||
    mag === "true" ||
    mag === "typ1";
  if (!isTtf) {
    await rm(outFile, { force: true }).catch(() => {});
    throw new Error(`Noto file is not TrueType (magic=${[...buf.subarray(0, 4)].map((b) => b.toString(16)).join(" ")})`);
  }
  console.log(`[fetch-fonts] Noto TTF ok (${buf.length} bytes)`);
}

async function unzipExtract(zipPath, destDir) {
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
  await fetchNotoTtf();
  await fetchZhuque();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
