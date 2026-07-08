const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { URL } = require('url')

const DEFAULT_PORTAL_BASE_URL =
  process.env.REPORT_EDITOR_PORTAL_BASE_URL || 'https://brportal.cpolar.top'

function getSettingsPath(app) {
  return path.join(app.getPath('userData'), 'layout-sync-settings.json')
}

function readSettings(app) {
  const p = getSettingsPath(app)
  try {
    if (!fs.existsSync(p)) return {}
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeSettings(app, patch) {
  const p = getSettingsPath(app)
  const next = { ...readSettings(app), ...patch }
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function resolvePortalBase(app) {
  const saved = String(readSettings(app).portalBaseUrl || '').trim()
  return (saved || DEFAULT_PORTAL_BASE_URL).replace(/\/+$/, '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientNetworkError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ||
    msg.includes('Client network socket disconnected before secure TLS connection was established') ||
    msg.includes('socket hang up') ||
    msg.includes('请求超时')
  )
}

function friendlyNetworkError(err, urlStr) {
  const raw = String(err?.message || err || '网络请求失败')
  const code = err?.code ? `（${err.code}）` : ''
  let host = ''
  try {
    host = new URL(urlStr).host
  } catch {
    host = 'Portal'
  }
  if (raw.includes('Client network socket disconnected before secure TLS connection was established')) {
    return new Error(
      `连接 ${host} 时 TLS 握手前被断开${code}。请确认 Portal 地址可访问、网络/代理未拦截；若是内网自签证书可勾选“信任内网证书”后重试。`,
    )
  }
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
    return new Error(`无法解析 Portal 域名 ${host}${code}，请检查网络、DNS 或 Portal 地址。`)
  }
  if (err?.code === 'ECONNREFUSED') {
    return new Error(`Portal ${host} 拒绝连接${code}，请确认服务在线且端口正确。`)
  }
  if (raw.includes('self-signed certificate') || raw.includes('unable to verify')) {
    return new Error(`Portal 证书校验失败${code}。若确认是可信内网服务，可勾选“信任内网证书”后重试。`)
  }
  if (raw.includes('请求超时') || err?.code === 'ETIMEDOUT') {
    return new Error(`连接 Portal ${host} 超时${code}，请稍后重试或检查网络代理。`)
  }
  return new Error(`${raw}${code}`)
}

function requestJsonOnce(method, urlStr, { token, body, skipTlsVerify = false, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlStr)
    } catch {
      reject(new Error('无效的服务器地址'))
      return
    }
    const payload = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const lib = url.protocol === 'https:' ? https : http
    const headers = {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    const req = lib.request(
      url,
      {
        method,
        headers,
        rejectUnauthorized: skipTlsVerify ? false : undefined,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          requestJsonOnce(method, new URL(res.headers.location, url).href, { token, body, skipTlsVerify, timeoutMs })
            .then(resolve)
            .catch(reject)
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = text ? JSON.parse(text) : null
          } catch {
            reject(new Error(`服务器返回格式无效（HTTP ${res.statusCode || '?'}）`))
            return
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            const msg =
              (data && (data.error || data.message)) ||
              `请求失败（HTTP ${res.statusCode || '?'}）`
            reject(new Error(String(msg)))
            return
          }
          resolve(data)
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('请求超时')))
    if (payload) req.write(payload)
    req.end()
  })
}

async function requestJson(method, urlStr, options = {}) {
  const attempts = Math.max(1, Number(options.retries ?? (method === 'GET' ? 3 : 1)))
  let lastErr = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await requestJsonOnce(method, urlStr, options)
    } catch (err) {
      lastErr = err
      if (i >= attempts - 1 || !isTransientNetworkError(err)) break
      await sleep(450 * (i + 1))
    }
  }
  throw friendlyNetworkError(lastErr, urlStr)
}

function apiUrl(app, suffix) {
  const base = resolvePortalBase(app)
  const pathPart = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${base}${pathPart}`
}

function createLayoutSync(app) {
  return {
    getConfig() {
      const s = readSettings(app)
      return {
        portalBaseUrl: resolvePortalBase(app),
        defaultPortalBaseUrl: DEFAULT_PORTAL_BASE_URL,
        username: s.username || '',
        loggedIn: Boolean(s.token),
        skipTlsVerify: Boolean(s.skipTlsVerify),
      }
    },

    setConfig(patch) {
      const next = {}
      if (typeof patch.portalBaseUrl === 'string') next.portalBaseUrl = patch.portalBaseUrl.trim()
      if (typeof patch.skipTlsVerify === 'boolean') next.skipTlsVerify = patch.skipTlsVerify
      if (patch.logout === true) {
        next.token = ''
        next.username = ''
      }
      writeSettings(app, next)
      return this.getConfig()
    },

    async login({ username, password }) {
      const u = String(username || '').trim()
      const p = String(password || '')
      if (!u || !p) throw new Error('请输入用户名和密码')
      const skipTlsVerify = Boolean(readSettings(app).skipTlsVerify)
      const data = await requestJson('POST', apiUrl(app, '/api/report-editor/login'), {
        body: { username: u, password: p },
        skipTlsVerify,
      })
      if (!data || !data.ok || !data.token) {
        throw new Error((data && data.error) || '登录失败')
      }
      writeSettings(app, {
        token: data.token,
        username: data.username || u,
      })
      return { ok: true, username: data.username || u, expiresAt: data.expiresAt || null }
    },

    async register({ username, password, passwordConfirm }) {
      const u = String(username || '').trim()
      const p = String(password || '')
      const c = String(passwordConfirm || '')
      if (!u || !p) throw new Error('请输入用户名和密码')
      const skipTlsVerify = Boolean(readSettings(app).skipTlsVerify)
      const data = await requestJson('POST', apiUrl(app, '/api/report-editor/register'), {
        body: { username: u, password: p, password_confirm: c || p },
        skipTlsVerify,
      })
      if (!data || !data.ok || !data.token) {
        throw new Error((data && data.error) || '注册失败')
      }
      writeSettings(app, {
        token: data.token,
        username: data.username || u,
      })
      return { ok: true, username: data.username || u, expiresAt: data.expiresAt || null }
    },

    async downloadDefaults() {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const opts = { token: s.token, skipTlsVerify: Boolean(s.skipTlsVerify) }
      const layouts = await requestJson('GET', apiUrl(app, '/api/report-editor/layout-presets/defaults'), opts)
      const templates = await requestJson('GET', apiUrl(app, '/api/report-editor/templates/defaults'), opts)
      if (!layouts || !layouts.ok) throw new Error((layouts && layouts.error) || '版式下载失败')
      if (!templates || !templates.ok) throw new Error((templates && templates.error) || '模版下载失败')
      return {
        ok: true,
        layout_presets: Array.isArray(layouts.layout_presets) ? layouts.layout_presets : [],
        templates: Array.isArray(templates.templates) ? templates.templates : [],
        layoutUpdatedAt: layouts.updatedAt || null,
        templateUpdatedAt: templates.updatedAt || null,
        source: layouts.source || 'team-default',
      }
    },

    async downloadMine() {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const opts = { token: s.token, skipTlsVerify: Boolean(s.skipTlsVerify) }
      const layouts = await requestJson('GET', apiUrl(app, '/api/report-editor/layout-presets'), opts)
      const templates = await requestJson('GET', apiUrl(app, '/api/report-editor/templates'), opts)
      if (!layouts || !layouts.ok) throw new Error((layouts && layouts.error) || '版式下载失败')
      if (!templates || !templates.ok) throw new Error((templates && templates.error) || '模版下载失败')
      return {
        ok: true,
        layout_presets: Array.isArray(layouts.layout_presets) ? layouts.layout_presets : [],
        templates: Array.isArray(templates.templates) ? templates.templates : [],
        layoutUpdatedAt: layouts.updatedAt || null,
        templateUpdatedAt: templates.updatedAt || null,
        source: layouts.source || 'user',
      }
    },

    async upload(payload) {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const layoutPresets = Array.isArray(payload?.layoutPresets)
        ? payload.layoutPresets
        : Array.isArray(payload)
          ? payload
          : []
      const templates = Array.isArray(payload?.templates) ? payload.templates : []
      if (!layoutPresets.length && !templates.length) {
        throw new Error('没有可上传的模版或版式')
      }
      const opts = { token: s.token, skipTlsVerify: Boolean(s.skipTlsVerify) }
      let layoutCount = 0
      let templateCount = 0
      let layoutUpdatedAt = null
      let templateUpdatedAt = null
      if (layoutPresets.length) {
        const data = await requestJson('PUT', apiUrl(app, '/api/report-editor/layout-presets'), {
          ...opts,
          body: { layout_presets: layoutPresets },
          timeoutMs: 180000,
        })
        if (!data || !data.ok) throw new Error((data && data.error) || '版式上传失败')
        layoutCount = data.count || layoutPresets.length
        layoutUpdatedAt = data.updatedAt || null
      }
      if (templates.length) {
        const data = await requestJson('PUT', apiUrl(app, '/api/report-editor/templates'), {
          ...opts,
          body: { templates },
          timeoutMs: 180000,
        })
        if (!data || !data.ok) throw new Error((data && data.error) || '模版上传失败')
        templateCount = data.count || templates.length
        templateUpdatedAt = data.updatedAt || null
      }
      return {
        ok: true,
        layoutCount,
        templateCount,
        count: layoutCount + templateCount,
        layoutUpdatedAt,
        templateUpdatedAt,
      }
    },

    /** 上传整机加密配置备份（.rebak 字节的 base64）到 Portal 个人空间 */
    async uploadConfigBundle(payload) {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const bundleBase64 = String(payload?.bundleBase64 || '')
      if (!bundleBase64) throw new Error('没有可上传的配置备份')
      const opts = { token: s.token, skipTlsVerify: Boolean(s.skipTlsVerify) }
      let data
      try {
        data = await requestJson('PUT', apiUrl(app, '/api/report-editor/config-bundle'), {
          ...opts,
          body: { bundle_base64: bundleBase64, format: 'rebak' },
          timeoutMs: 180000,
        })
      } catch (err) {
        throw normalizeConfigBundleEndpointError(err)
      }
      if (!data || !data.ok) throw new Error((data && data.error) || '配置备份上传失败')
      return { ok: true, updatedAt: data.updatedAt || null, sizeBytes: data.sizeBytes || null }
    },

    /** 从 Portal 个人空间下载整机加密配置备份 */
    async downloadConfigBundle() {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const opts = { token: s.token, skipTlsVerify: Boolean(s.skipTlsVerify) }
      let data
      try {
        data = await requestJson('GET', apiUrl(app, '/api/report-editor/config-bundle'), {
          ...opts,
          timeoutMs: 180000,
        })
      } catch (err) {
        throw normalizeConfigBundleEndpointError(err)
      }
      if (!data || !data.ok) throw new Error((data && data.error) || '配置备份下载失败')
      const bundleBase64 = String(data.bundle_base64 || '')
      if (!bundleBase64) throw new Error('云端还没有整机配置备份，请先在本机上传一次。')
      return { ok: true, bundleBase64, updatedAt: data.updatedAt || null }
    },
  }
}

/** Portal 未升级（无 config-bundle 接口）时给出明确指引，而不是裸 404 */
function normalizeConfigBundleEndpointError(err) {
  const msg = String(err?.message || err || '')
  if (msg.includes('404') || msg.includes('HTTP 404')) {
    return new Error('当前 Portal 版本暂不支持整机配置云备份（缺少 config-bundle 接口），请先升级 Portal 服务。')
  }
  return err instanceof Error ? err : new Error(msg)
}

module.exports = { createLayoutSync }
