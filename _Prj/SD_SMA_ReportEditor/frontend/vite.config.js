import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // Electron loadFile 使用 file://，必须用相对路径，否则 /assets/* 会指向盘符根目录导致白屏
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // 异步路由默认会拆出独立 CSS；Electron 下 JS 常先于 CSS 执行，数据源等页会出现短暂「未样式化」布局，过一会才恢复。
    // 合并为单一 CSS（由 index.html 同步引入），避免 FOUC。
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    // 避免 5173 被占用时静默改到 5174，导致 wait-on / Electron 仍打开 5173 而页面空白或连错实例
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        timeout: 1_800_000,
      },
    },
  },
})
