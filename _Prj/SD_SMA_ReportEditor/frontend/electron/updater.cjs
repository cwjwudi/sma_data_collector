const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { spawn } = require('child_process')
const { URL } = require('url')

/** 默认更新源：WebPortal 静态目录（https://brportal.cpolar.top/downloads/report-editor） */
const DEFAULT_UPDATE_BASE_URL =
  process.env.REPORT_EDITOR_UPDATE_BASE_URL ||
  'https://brportal.cpolar.top/downloads/report-editor'

function compareSemver(a, b) {
  const pa = String(a || '0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

function getPlatformKey() {
  return `${process.platform}-${process.arch}`
}

function getSettingsPath(app) {
  return path.join(app.getPath('userData'), 'update-settings.json')
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

function resolveBaseUrl(app) {
  const saved = String(readSettings(app).baseUrl || '').trim()
  return saved || DEFAULT_UPDATE_BASE_URL
}

function fetchBuffer(urlStr, { skipTlsVerify = false, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlStr)
    } catch (e) {
      reject(new Error(`无效的 URL：${urlStr}`))
      return
    }
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      url,
      {
        method: 'GET',
        rejectUnauthorized: skipTlsVerify ? false : undefined,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBuffer(new URL(res.headers.location, url).href, { skipTlsVerify, timeoutMs })
            .then(resolve)
            .catch(reject)
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode || '错误'}：${urlStr}`))
          res.resume()
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('请求超时'))
    })
    req.end()
  })
}

function downloadFile(urlStr, destPath, { skipTlsVerify = false, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlStr)
    } catch (e) {
      reject(new Error(`无效的 URL：${urlStr}`))
      return
    }
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      url,
      {
        method: 'GET',
        rejectUnauthorized: skipTlsVerify ? false : undefined,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(new URL(res.headers.location, url).href, destPath, { skipTlsVerify, onProgress })
            .then(resolve)
            .catch(reject)
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`下载失败 HTTP ${res.statusCode || '错误'}`))
          res.resume()
          return
        }
        const total = Number(res.headers['content-length']) || 0
        let received = 0
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        const file = fs.createWriteStream(destPath)
        res.on('data', (chunk) => {
          received += chunk.length
          if (onProgress) {
            onProgress({ received, total, percent: total ? Math.round((received / total) * 100) : null })
          }
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve({ path: destPath, size: received })))
        file.on('error', (err) => {
          fs.unlink(destPath, () => reject(err))
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(600000, () => {
      req.destroy(new Error('下载超时'))
    })
    req.end()
  })
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function pickArtifact(manifest, platformKey) {
  const platforms = manifest && manifest.platforms
  if (!platforms || typeof platforms !== 'object') return null
  if (platforms[platformKey]) return platforms[platformKey]
  if (process.platform === 'darwin' && platforms.darwin) return platforms.darwin
  if (process.platform === 'win32' && platforms.win32) return platforms.win32
  return null
}

function createAppUpdater({ app, shell, getMainWindow, stopBackend }) {
  let pending = null
  let downloadedPath = null

  function emit(channel, payload) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  function getUpdateDir() {
    return path.join(app.getPath('temp'), 'report-editor-updates')
  }

  function clearDownloaded() {
    if (downloadedPath && fs.existsSync(downloadedPath)) {
      try {
        fs.unlinkSync(downloadedPath)
      } catch {
        /* ignore */
      }
    }
    downloadedPath = null
  }

  async function fetchManifest() {
    const settings = readSettings(app)
    const baseUrl = resolveBaseUrl(app).replace(/\/+$/, '')
    if (!baseUrl) {
      throw new Error('尚未配置更新服务器。请联系管理员，或在「高级设置」中填写。')
    }
    const manifestUrl = `${baseUrl}/latest.json`
    const skipTlsVerify = Boolean(settings.skipTlsVerify)
    const buf = await fetchBuffer(manifestUrl, { skipTlsVerify })
    let manifest
    try {
      manifest = JSON.parse(buf.toString('utf8'))
    } catch {
      throw new Error('无法读取更新信息，请稍后重试或联系管理员。')
    }
    if (!manifest || typeof manifest.version !== 'string') {
      throw new Error('更新信息不完整，请联系管理员。')
    }
    return { manifest, manifestUrl, baseUrl }
  }

  return {
    getConfig() {
      const settings = readSettings(app)
      return {
        currentVersion: app.getVersion(),
        platform: getPlatformKey(),
        baseUrl: resolveBaseUrl(app),
        defaultBaseUrl: DEFAULT_UPDATE_BASE_URL,
        skipTlsVerify: Boolean(settings.skipTlsVerify),
        packaged: app.isPackaged,
      }
    },

    setConfig(patch) {
      const next = {}
      if (typeof patch.baseUrl === 'string') {
        next.baseUrl = patch.baseUrl.trim()
      }
      if (typeof patch.skipTlsVerify === 'boolean') {
        next.skipTlsVerify = patch.skipTlsVerify
      }
      writeSettings(app, next)
      clearDownloaded()
      pending = null
      return this.getConfig()
    },

    async check() {
      if (!app.isPackaged) {
        return {
          ok: true,
          status: 'dev',
          currentVersion: app.getVersion(),
          message: '开发模式无法在线升级，请使用正式安装版。',
        }
      }
      clearDownloaded()
      pending = null
      const currentVersion = app.getVersion()
      const platformKey = getPlatformKey()
      try {
        const { manifest, manifestUrl, baseUrl } = await fetchManifest()
        const artifact = pickArtifact(manifest, platformKey)
        if (!artifact || typeof artifact.url !== 'string' || !artifact.url.trim()) {
          return {
            ok: false,
            status: 'unsupported',
            currentVersion,
            message: '当前系统暂无可用升级包，请联系管理员。',
            manifestUrl,
          }
        }
        const latestVersion = manifest.version.trim()
        const cmp = compareSemver(latestVersion, currentVersion)
        if (cmp <= 0) {
          return {
            ok: true,
            status: 'latest',
            currentVersion,
            latestVersion,
            message: '当前已是最新版本。',
            releasedAt: manifest.releasedAt || null,
            notes: manifest.notes || '',
            manifestUrl,
          }
        }
        pending = {
          currentVersion,
          latestVersion,
          notes: manifest.notes || '',
          releasedAt: manifest.releasedAt || null,
          artifact: {
            ...artifact,
            url: new URL(artifact.url.trim(), `${baseUrl}/`).href,
          },
          manifestUrl,
        }
        return {
          ok: true,
          status: 'available',
          currentVersion,
          latestVersion,
          notes: pending.notes,
          releasedAt: pending.releasedAt,
          downloadUrl: artifact.url,
          size: artifact.size || null,
          manifestUrl,
        }
      } catch (e) {
        return {
          ok: false,
          status: 'error',
          currentVersion,
          message: e.message || String(e),
        }
      }
    },

    async download() {
      if (!app.isPackaged) {
        return { ok: false, error: '开发模式不支持下载安装包' }
      }
      if (!pending || !pending.artifact) {
        return { ok: false, error: '请先检查更新' }
      }
      const settings = readSettings(app)
      const skipTlsVerify = Boolean(settings.skipTlsVerify)
      clearDownloaded()
      const url = pending.artifact.url.trim()
      const fileName = path.basename(new URL(url).pathname) || `update-${pending.latestVersion}`
      const dest = path.join(getUpdateDir(), fileName)
      try {
        emit('update-download-progress', { phase: 'start', received: 0, total: 0, percent: 0 })
        await downloadFile(url, dest, {
          skipTlsVerify,
          onProgress: (p) => emit('update-download-progress', { phase: 'progress', ...p }),
        })
        if (pending.artifact.sha256) {
          const hash = await sha256File(dest)
          const expected = String(pending.artifact.sha256).trim().toLowerCase()
          if (hash.toLowerCase() !== expected) {
            fs.unlinkSync(dest)
            return { ok: false, error: '安装包校验失败（SHA256 不匹配），已取消下载。' }
          }
        }
        downloadedPath = dest
        emit('update-download-progress', { phase: 'done', percent: 100 })
        return {
          ok: true,
          path: dest,
          latestVersion: pending.latestVersion,
        }
      } catch (e) {
        clearDownloaded()
        return { ok: false, error: e.message || String(e) }
      }
    },

    async install() {
      if (!app.isPackaged) {
        return { ok: false, error: '开发模式不支持安装' }
      }
      if (!downloadedPath || !fs.existsSync(downloadedPath)) {
        return { ok: false, error: '请先下载安装包' }
      }
      stopBackend()
      const filePath = downloadedPath
      const ext = path.extname(filePath).toLowerCase()

      if (process.platform === 'win32' && (ext === '.exe' || ext === '.msi')) {
        spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref()
        setTimeout(() => app.quit(), 400)
        return {
          ok: true,
          mode: 'installer',
          message: '已启动安装程序，本软件即将退出，请按安装向导完成升级。',
        }
      }

      if (process.platform === 'darwin' && ext === '.dmg') {
        const err = await shell.openPath(filePath)
        if (err) {
          return { ok: false, error: err }
        }
        return {
          ok: true,
          mode: 'dmg',
          message:
            '已打开安装镜像。请将「Report Editor」拖入「应用程序」文件夹完成升级，然后重新打开软件。',
        }
      }

      if (process.platform === 'darwin' && ext === '.zip') {
        const err = await shell.openPath(filePath)
        if (err) {
          return { ok: false, error: err }
        }
        return {
          ok: true,
          mode: 'zip',
          message: '已打开升级包，请按说明替换应用程序后重新打开软件。',
        }
      }

      const err = await shell.openPath(filePath)
      if (err) {
        return { ok: false, error: err }
      }
      return {
        ok: true,
        mode: 'open',
        message: '已打开安装包，请按系统提示完成升级。',
      }
    },
  }
}

module.exports = {
  createAppUpdater,
  compareSemver,
  getPlatformKey,
  DEFAULT_UPDATE_BASE_URL,
}
