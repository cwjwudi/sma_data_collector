/** 统一请求前缀 `/api`（与 Vite 代理一致）。 */
export async function apiFetch(path, options = {}) {
  const p = path.startsWith('/') ? path : `/${path}`
  const url = `/api${p}`
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
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return data
}
