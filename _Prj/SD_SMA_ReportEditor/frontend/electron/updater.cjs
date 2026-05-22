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

const MAC_APP_BUNDLE = '/Applications/Report Editor.app'

function spawnMacOpenAfterUpgradeWatcher() {
  if (process.platform !== 'darwin') return
  const script = [
    `APP=${JSON.stringify(MAC_APP_BUNDLE)}`,
    'MARK=$(stat -f %m "$APP" 2>/dev/null || echo 0)',
    'for _ in $(seq 1 120); do',
    '  sleep 3',
    '  NOW=$(stat -f %m "$APP" 2>/dev/null || echo 0)',
    '  if [ "$NOW" != "$MARK" ] && [ "$NOW" != "0" ]; then',
    '    sleep 2',
    '    open "$APP"',
    '    exit 0',
    '  fi',
    'done',
  ].join('\n')
  spawn('bash', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
}

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

function downloadFile(urlStr, destPath, { skipTlsVerify = false, onProgress, abortRef, startByte = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlStr)
    } catch (e) {
      reject(new Error(`无效的 URL：${urlStr}`))
      return
    }
    const lib = url.protocol === 'https:' ? https : http
    let settled = false
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      fn(arg)
    }
    const headers = {}
    if (startByte > 0) {
      headers.Range = `bytes=${startByte}-`
    }
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        rejectUnauthorized: skipTlsVerify ? false : undefined,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(new URL(res.headers.location, url).href, destPath, {
            skipTlsVerify,
            onProgress,
            abortRef,
            startByte,
          })
            .then((v) => finish(resolve, v))
            .catch((e) => finish(reject, e))
          return
        }
        if (startByte > 0 && res.statusCode === 200) {
          finish(reject, new Error('RESUME_NOT_SUPPORTED'))
          res.resume()
          return
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          finish(reject, new Error(`下载失败 HTTP ${res.statusCode || '错误'}`))
          res.resume()
          return
        }
        let total = Number(res.headers['content-length']) || 0
        const contentRange = res.headers['content-range']
        if (contentRange) {
          const m = /\/(\d+)\s*$/.exec(String(contentRange))
          if (m) total = Number(m[1]) || total
        } else if (startByte > 0 && total > 0) {
          total = startByte + total
        }
        let received = startByte
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        const file = fs.createWriteStream(destPath, { flags: startByte > 0 ? 'a' : 'w' })
        res.on('data', (chunk) => {
          received += chunk.length
          if (onProgress) {
            onProgress({
              received,
              total,
              percent: total ? Math.min(100, Math.round((received / total) * 100)) : null,
            })
          }
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => finish(resolve, { path: destPath, size: received, total })))
        file.on('error', (err) => {
          fs.unlink(destPath, () => finish(reject, err))
        })
      },
    )
    if (abortRef) {
      abortRef.abort = () => {
        try {
          req.destroy()
        } catch {
          /* ignore */
        }
        finish(reject, new Error('DOWNLOAD_ABORTED'))
      }
    }
    req.on('error', (err) => finish(reject, err))
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
  let lastCheckResult = null
  let downloading = false
  let downloadPaused = false
  let downloadPercent = null
  let partialDest = null
  let partialReceived = 0
  let partialTotal = 0
  let activeDownloadAbort = null

  function emit(channel, payload) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  function emitCheckResult(result) {
    const checkedAt = new Date().toISOString()
    lastCheckResult = { ...result, checkedAt }
    writeSettings(app, {
      lastCheckAt: checkedAt,
      lastCheckStatus: result?.status || null,
    })
    emit('update-check-result', lastCheckResult)
  }

  function getUpdateDir() {
    return path.join(app.getPath('temp'), 'report-editor-updates')
  }

  function clearPartialDownload() {
    if (partialDest && partialDest !== downloadedPath && fs.existsSync(partialDest)) {
      try {
        fs.unlinkSync(partialDest)
      } catch {
        /* ignore */
      }
    }
    partialDest = null
    partialReceived = 0
    partialTotal = 0
    downloadPaused = false
  }

  function clearDownloaded() {
    clearPartialDownload()
    if (downloadedPath && fs.existsSync(downloadedPath)) {
      try {
        fs.unlinkSync(downloadedPath)
      } catch {
        /* ignore */
      }
    }
    downloadedPath = null
  }

  function pauseActiveDownload() {
    if (activeDownloadAbort && typeof activeDownloadAbort.abort === 'function') {
      activeDownloadAbort.abort()
      activeDownloadAbort = null
    }
    downloading = false
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
        macOpenAfterUpgrade: settings.macOpenAfterUpgrade !== false,
        skippedVersions: settings.skippedVersions || {},
        packaged: app.isPackaged,
        lastCheckAt: settings.lastCheckAt || null,
        lastCheckStatus: settings.lastCheckStatus || null,
      }
    },

    getState() {
      return {
        lastCheck: lastCheckResult,
        downloading,
        downloadPaused,
        downloadPercent: downloading || downloadPaused ? downloadPercent : null,
        downloadedReady: Boolean(downloadedPath && fs.existsSync(downloadedPath)),
        latestVersion: pending?.latestVersion || lastCheckResult?.latestVersion || null,
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
      if (typeof patch.macOpenAfterUpgrade === 'boolean') {
        next.macOpenAfterUpgrade = patch.macOpenAfterUpgrade
      }
      writeSettings(app, next)
      pauseActiveDownload()
      clearDownloaded()
      pending = null
      return this.getConfig()
    },

    async check(options = {}) {
      const silent = Boolean(options.silent)
      if (!app.isPackaged) {
        const devResult = {
          ok: true,
          status: 'dev',
          currentVersion: app.getVersion(),
          message: '开发模式无法在线升级，请使用正式安装版。',
        }
        emitCheckResult(devResult)
        return devResult
      }
      if (!silent) {
        pauseActiveDownload()
        clearDownloaded()
        pending = null
      } else if (!downloading && !downloadedPath && !downloadPaused) {
        pending = null
      }
      const currentVersion = app.getVersion()
      const platformKey = getPlatformKey()
      try {
        const { manifest, manifestUrl, baseUrl } = await fetchManifest()
        const artifact = pickArtifact(manifest, platformKey)
        if (!artifact || typeof artifact.url !== 'string' || !artifact.url.trim()) {
          const unsupported = {
            ok: false,
            status: 'unsupported',
            currentVersion,
            message: '当前系统暂无可用升级包，请联系管理员。',
            manifestUrl,
          }
          emitCheckResult(unsupported)
          return unsupported
        }
        const latestVersion = manifest.version.trim()
        const skipped = readSettings(app).skippedVersions || {}
        if (skipped[latestVersion]) {
          const skippedResult = {
            ok: true,
            status: silent ? 'latest' : 'skipped',
            currentVersion,
            latestVersion,
            message: silent
              ? '当前已是最新版本。'
              : `已跳过版本 ${latestVersion}。如需升级请点「检查更新」并重新下载，或等待更高版本发布。`,
            releasedAt: manifest.releasedAt || null,
            notes: manifest.notes || '',
            manifestUrl,
          }
          emitCheckResult(skippedResult)
          return skippedResult
        }
        const cmp = compareSemver(latestVersion, currentVersion)
        if (cmp <= 0) {
          const latest = {
            ok: true,
            status: 'latest',
            currentVersion,
            latestVersion,
            message: '当前已是最新版本。',
            releasedAt: manifest.releasedAt || null,
            notes: manifest.notes || '',
            manifestUrl,
          }
          emitCheckResult(latest)
          return latest
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
        const available = {
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
        emitCheckResult(available)
        return available
      } catch (e) {
        const errResult = {
          ok: false,
          status: 'error',
          currentVersion,
          message: e.message || String(e),
        }
        emitCheckResult(errResult)
        return errResult
      }
    },

    pauseDownload() {
      if (!downloading) {
        return { ok: true, paused: false }
      }
      pauseActiveDownload()
      return { ok: true, paused: true }
    },

    cancelDownload() {
      return this.pauseDownload()
    },

    skipAvailableVersion() {
      const version = pending?.latestVersion || lastCheckResult?.latestVersion
      if (!version) {
        return { ok: false, error: '当前没有可跳过的新版本' }
      }
      const settings = readSettings(app)
      const skippedVersions = { ...(settings.skippedVersions || {}), [version]: true }
      writeSettings(app, { skippedVersions })
      pending = null
      clearDownloaded()
      pauseActiveDownload()
      const skippedResult = {
        ok: true,
        status: 'skipped',
        currentVersion: app.getVersion(),
        latestVersion: version,
        message: `已跳过版本 ${version}。`,
      }
      emitCheckResult(skippedResult)
      return { ok: true, version }
    },

    openMacApplication() {
      if (process.platform !== 'darwin') {
        return { ok: false, error: '仅 macOS 可用' }
      }
      if (!fs.existsSync(MAC_APP_BUNDLE)) {
        return { ok: false, error: '未在「应用程序」中找到 Report Editor，请先完成拖放安装。' }
      }
      const err = shell.openPath(MAC_APP_BUNDLE)
      if (err) {
        return { ok: false, error: err }
      }
      return { ok: true }
    },

    async download() {
      if (!app.isPackaged) {
        return { ok: false, error: '开发模式不支持下载安装包' }
      }
      if (downloading) {
        return { ok: true, status: 'downloading' }
      }
      if (downloadedPath && fs.existsSync(downloadedPath)) {
        return {
          ok: true,
          path: downloadedPath,
          latestVersion: pending?.latestVersion || lastCheckResult?.latestVersion,
          status: 'ready',
        }
      }
      if (!pending || !pending.artifact) {
        return { ok: false, error: '请先检查更新' }
      }
      const settings = readSettings(app)
      const skipTlsVerify = Boolean(settings.skipTlsVerify)
      const url = pending.artifact.url.trim()
      const fileName = path.basename(new URL(url).pathname) || `update-${pending.latestVersion}`
      let dest = path.join(getUpdateDir(), fileName)
      let startByte = 0
      const resuming = downloadPaused && partialDest && fs.existsSync(partialDest)
      if (resuming) {
        dest = partialDest
        startByte = fs.statSync(dest).size
        partialReceived = startByte
        downloadPaused = false
      } else {
        clearDownloaded()
      }
      if (!partialTotal && pending.artifact.size) {
        partialTotal = Number(pending.artifact.size) || 0
      }
      downloading = true
      if (!resuming) {
        downloadPercent = 0
      }
      activeDownloadAbort = {}
      try {
        emit('update-download-progress', {
          phase: resuming ? 'resume' : 'start',
          received: startByte,
          total: partialTotal || pending.artifact.size || 0,
          percent: downloadPercent,
        })
        await downloadFile(url, dest, {
          skipTlsVerify,
          abortRef: activeDownloadAbort,
          startByte,
          onProgress: (p) => {
            downloadPercent = p.percent
            partialReceived = p.received
            if (p.total) partialTotal = p.total
            partialDest = dest
            emit('update-download-progress', { phase: 'progress', ...p })
          },
        })
        activeDownloadAbort = null
        if (pending.artifact.sha256) {
          const hash = await sha256File(dest)
          const expected = String(pending.artifact.sha256).trim().toLowerCase()
          if (hash.toLowerCase() !== expected) {
            fs.unlinkSync(dest)
            downloading = false
            downloadPercent = null
            emit('update-download-progress', { phase: 'error' })
            return {
              ok: false,
              checksumError: true,
              error:
                '安装包校验失败（SHA256 不匹配），已删除下载文件。请重新下载；若多次失败，请联系管理员核对更新服务器上的安装包是否与 latest.json 登记一致。',
              expectedPrefix: expected.slice(0, 12),
              actualPrefix: hash.toLowerCase().slice(0, 12),
            }
          }
        }
        downloadedPath = dest
        partialDest = null
        partialReceived = 0
        partialTotal = 0
        downloadPaused = false
        downloading = false
        downloadPercent = 100
        emit('update-download-progress', { phase: 'done', percent: 100 })
        return {
          ok: true,
          path: dest,
          latestVersion: pending.latestVersion,
        }
      } catch (e) {
        activeDownloadAbort = null
        downloading = false
        if (String(e.message) === 'DOWNLOAD_ABORTED') {
          try {
            if (fs.existsSync(dest)) {
              partialDest = dest
              partialReceived = fs.statSync(dest).size
              downloadPaused = true
              const sizeHint = partialTotal || Number(pending?.artifact?.size) || 0
              downloadPercent = sizeHint
                ? Math.min(100, Math.round((partialReceived / sizeHint) * 100))
                : downloadPercent
            }
          } catch {
            /* ignore */
          }
          emit('update-download-progress', {
            phase: 'paused',
            received: partialReceived,
            total: partialTotal,
            percent: downloadPercent,
          })
          return { ok: false, cancelled: true, paused: true, error: '下载已暂停，可点击「继续下载」' }
        }
        if (String(e.message) === 'RESUME_NOT_SUPPORTED') {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest)
          } catch {
            /* ignore */
          }
          partialDest = null
          partialReceived = 0
          downloadPaused = false
          downloadPercent = null
          emit('update-download-progress', { phase: 'error' })
          return { ok: false, error: '服务器不支持断点续传，请重新点击「下载新版本」。' }
        }
        downloadPercent = null
        clearDownloaded()
        emit('update-download-progress', { phase: 'error' })
        return { ok: false, error: e.message || String(e) }
      }
    },

    async install(options = {}) {
      if (!app.isPackaged) {
        return { ok: false, error: '开发模式不支持安装' }
      }
      if (!downloadedPath || !fs.existsSync(downloadedPath)) {
        return { ok: false, error: '请先下载安装包' }
      }
      stopBackend()
      const filePath = downloadedPath
      const ext = path.extname(filePath).toLowerCase()
      const openAfterUpgrade =
        process.platform === 'darwin' &&
        Boolean(options.openAfterUpgrade ?? readSettings(app).macOpenAfterUpgrade !== false)

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
        if (openAfterUpgrade) {
          spawnMacOpenAfterUpgradeWatcher()
        }
        setTimeout(() => app.quit(), 400)
        const autoOpenHint = openAfterUpgrade
          ? '④ 拖放完成后，系统会尝试自动打开新版本（约需数秒）。'
          : '④ 从启动台或应用程序文件夹重新打开 Report Editor。'
        return {
          ok: true,
          mode: 'dmg',
          message: `已打开安装镜像，本软件即将退出。请按下方步骤完成升级：① 在弹出的窗口中将「Report Editor」拖入「应用程序」；② 若系统提示替换，选择「替换」；③ 关闭安装窗口；${autoOpenHint}`,
        }
      }

      if (process.platform === 'darwin' && ext === '.zip') {
        const err = await shell.openPath(filePath)
        if (err) {
          return { ok: false, error: err }
        }
        if (openAfterUpgrade) {
          spawnMacOpenAfterUpgradeWatcher()
        }
        setTimeout(() => app.quit(), 400)
        return {
          ok: true,
          mode: 'zip',
          message: openAfterUpgrade
            ? '已打开升级包，本软件即将退出。请按说明替换应用程序；完成后系统会尝试自动打开新版本。'
            : '已打开升级包，本软件即将退出。请按说明替换应用程序后重新打开软件。',
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
