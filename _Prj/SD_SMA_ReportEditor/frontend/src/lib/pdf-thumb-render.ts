/**
 * 将 PDF 第一页渲染为 PNG data URL（用于历史报表缩略图）。
 * 不依赖 file:// embed，避免 Electron 开发模式下跨源限制。
 */
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export async function renderPdfFirstPageThumbDataUrl(
  pdfBytes: Uint8Array,
  maxCssWidth = 360,
): Promise<string> {
  const task = pdfjs.getDocument({ data: pdfBytes.slice(0), disableAutoFetch: true });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.15, maxCssWidth / Math.max(1, baseVp.width)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/png");
  } finally {
    await doc.destroy();
  }
}
