import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, "src/html"),
  publicDir: resolve(__dirname, "public"),
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
  },
});
