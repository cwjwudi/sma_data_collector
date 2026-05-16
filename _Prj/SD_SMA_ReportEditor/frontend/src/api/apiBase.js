/**
 * 解析浏览器/Electron 下实际请求的 API 根。
 * - 开发：同源相对路径 `/api…`，由 Vite 代理到后端（并可选 strip /api）。
 * - Electron `file://`：无代理，直连本机 uvicorn（与 electron/main.cjs 的 BACKEND_PORT 一致）。
 * - 可设 `VITE_API_ORIGIN=http://主机:端口` 覆盖（部署到自定义网关时）。
 * @returns {string} 无前缀末尾斜杠的 origin；空字符串表示使用相对 `/api`.
 */
export function getApiOrigin() {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_ORIGIN : undefined
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return 'http://127.0.0.1:8000'
  }
  return ''
}

/**
 * @param {string} path 如 `/templates` 或 `/environment/check`
 */
export function resolveApiHref(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const origin = getApiOrigin()
  return `${origin}/api${p}`
}
