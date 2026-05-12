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
      msg = Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join('; ') : JSON.stringify(d)
    }
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return data
}
