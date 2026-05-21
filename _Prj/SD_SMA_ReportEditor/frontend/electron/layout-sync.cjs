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

function requestJson(method, urlStr, { token, body, skipTlsVerify = false, timeoutMs = 60000 } = {}) {
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
          requestJson(method, new URL(res.headers.location, url).href, { token, body, skipTlsVerify, timeoutMs })
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
      const data = await requestJson('GET', apiUrl(app, '/api/report-editor/layout-presets/defaults'), {
        token: s.token,
        skipTlsVerify: Boolean(s.skipTlsVerify),
      })
      if (!data || !data.ok) throw new Error((data && data.error) || '下载失败')
      return {
        ok: true,
        layout_presets: Array.isArray(data.layout_presets) ? data.layout_presets : [],
        updatedAt: data.updatedAt || null,
        source: data.source || 'default',
      }
    },

    async downloadMine() {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      const data = await requestJson('GET', apiUrl(app, '/api/report-editor/layout-presets'), {
        token: s.token,
        skipTlsVerify: Boolean(s.skipTlsVerify),
      })
      if (!data || !data.ok) throw new Error((data && data.error) || '下载失败')
      return {
        ok: true,
        layout_presets: Array.isArray(data.layout_presets) ? data.layout_presets : [],
        updatedAt: data.updatedAt || null,
        source: data.source || 'user',
      }
    },

    async upload(items) {
      const s = readSettings(app)
      if (!s.token) throw new Error('请先登录')
      if (!Array.isArray(items) || !items.length) throw new Error('没有可上传的版式')
      const data = await requestJson('PUT', apiUrl(app, '/api/report-editor/layout-presets'), {
        token: s.token,
        body: { layout_presets: items },
        skipTlsVerify: Boolean(s.skipTlsVerify),
      })
      if (!data || !data.ok) throw new Error((data && data.error) || '上传失败')
      return {
        ok: true,
        count: data.count || items.length,
        updatedAt: data.updatedAt || null,
      }
    },
  }
}

module.exports = { createLayoutSync }
