/**
 * Download Noto Sans SC Regular (OFL) into frontend/resources/fonts/.
 * Default URL: jsDelivr mirror of notofonts/noto-cjk OTF (full SC Regular — large).
 * Override: NOTO_SC_URL=... node fetch-noto-sans-sc.mjs
 */
import { createWriteStream } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../frontend/resources/fonts");
const outFile = path.join(outDir, "NotoSansSC-Regular.otf");

const DEFAULT_URL =
  process.env.NOTO_SC_URL ||
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf";

async function main() {
  await mkdir(outDir, { recursive: true });
  try {
    await access(outFile);
    console.log(`[fetch-noto] already exists: ${outFile}`);
    return;
  } catch {
    /* download */
  }
  console.log(`[fetch-noto] GET ${DEFAULT_URL}`);
  const res = await fetch(DEFAULT_URL);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(outFile));
  console.log(`[fetch-noto] wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
