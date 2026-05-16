import { resolveApiHref } from './apiBase.js'

/** 统一请求前缀 `/api`（与 Vite 代理一致；Electron file:// 时直连 localhost:8000）。 */
export async function apiFetch(path, options = {}) {
  const p = path.startsWith('/') ? path : `/${path}`
  const url = resolveApiHref(p)
  const opts = { ...options }
  const headers = { ...opts.headers }
  if (opts.body !== undefined && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(opts.body)
  }
  const res = await fetch(url, { ...opts, headers })
  const text = await res.text()
  let data = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    let msg = text || res.statusText
    if (typeof data === 'object' && data?.detail !== undefined) {
      const d = data.detail
      msg = Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join('; ') : String(d)
    }
    const plain = typeof text === 'string' ? text.trim() : ''
    if (
      res.status === 500 &&
      (plain === 'Internal Server Error' || plain.startsWith('<!DOCTYPE') || plain.startsWith('<html'))
    ) {
      msg = `HTTP 500：后端异常（${p}）。请在后端终端查看堆栈，并确认已安装依赖：pip install -r backend/requirements.txt`
    }
    if (res.status === 502 || res.status === 503) {
      msg = `${msg}（可能是后端未启动或暂时不可写配置）`
    }
    if (res.status === 404) {
      throw new Error(
        `后端未找到 /api${p}（HTTP 404）。` +
          '请在本仓库 backend 目录用当前代码重启：`python -m uvicorn main:app --reload`（或重装应用包）；' +
          '仍 404 时请 `lsof -i :8000` 核对 8000 上是否跑着旧版 exe/其它框架。',
      )
    }
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return data
}

/**
 * POST 后按行读取 NDJSON（每行一个 JSON），用于环境重建等流式日志。
 * @param {string} path 如 /environment/repair-stream
 * @param {object} body
 * @param {(rec: object) => void} onRecord
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function apiPostNdjsonStream(path, body, onRecord, opts = {}) {
  const p = path.startsWith('/') ? path : `/${path}`
  const url = resolveApiHref(p)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = text || res.statusText
    try {
      const data = text ? JSON.parse(text) : null
      if (typeof data === 'object' && data?.detail !== undefined) {
        const d = data.detail
        msg = Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join('; ') : String(d)
      }
    } catch {
      /* keep text */
    }
    if (res.status === 404) {
      throw new Error(
        `后端未找到流式接口 /api${p}（HTTP 404）。` +
          '同一路由已同时挂在 `/environment/...` 与 `/api/environment/...`；若仍 404，请用当前仓库代码重启 backend（`uvicorn main:app`）。',
      )
    }
    throw new Error(msg || `HTTP ${res.status}`)
  }
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('响应不支持流式读取')
  }
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    for (;;) {
      const idx = buf.indexOf('\n')
      if (idx < 0) break
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        onRecord(JSON.parse(line))
      } catch {
        onRecord({ event: 'log', line })
      }
    }
  }
  const tail = buf.trim()
  if (tail) {
    try {
      onRecord(JSON.parse(tail))
    } catch {
      onRecord({ event: 'log', line: tail })
    }
  }
}
