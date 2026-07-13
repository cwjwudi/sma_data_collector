import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    // happy-dom：纯函数单测仍可用；Vue SFC（ConnectionManager 等）需 DOM
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
