const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { URL } = require('url')

const execFileAsync = promisify(execFile)

const MANIFEST_NAME = 'latest.json'

function fetchBuffer(urlStr, { skipTlsVerify = false, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(urlStr)
    } catch (e) {
      reject(e)
      return
    }
    const lib = url.protocol === 'https:' ? https : http
    const opts = { timeout: timeoutMs }
    if (url.protocol === 'https:' && skipTlsVerify) {
      opts.rejectUnauthorized = false
    }
    const req = lib.get(urlStr, opts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location, { skipTlsVerify, timeoutMs }).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        res.resume()
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('下载超时'))
    })
  })
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function readInstalledMeta(installRoot) {
  const p = path.join(installRoot, 'installed.json')
  try {
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

function writeInstalledMeta(installRoot, meta) {
  fs.mkdirSync(installRoot, { recursive: true })
  fs.writeFileSync(path.join(installRoot, 'installed.json'), JSON.stringify(meta, null, 2), 'utf8')
}

async function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    const ps = [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
    ]
    await execFileAsync('powershell.exe', ps, { windowsHide: true })
    return
  }
  await execFileAsync('unzip', ['-o', zipPath, '-d', destDir])
}

function createDemoPackManager({ app, resolveBaseUrl, readSkipTlsVerify }) {
  function getInstallRoot() {
    return path.join(app.getPath('userData'), 'demo-pack')
  }

  function getTempDir() {
    return path.join(app.getPath('temp'), 'report-editor-demo-pack')
  }

  function manifestUrl(baseUrl) {
    return `${String(baseUrl).replace(/\/+$/, '')}/demo-pack/${MANIFEST_NAME}`
  }

  return {
    getState() {
      const root = getInstallRoot()
      const meta = readInstalledMeta(root)
      return {
        installed: Boolean(meta?.version),
        version: meta?.version || '',
        installPath: root,
        installedAt: meta?.installedAt || null,
      }
    },

    async checkRemote() {
      const baseUrl = resolveBaseUrl()
      if (!baseUrl) {
        return { ok: false, error: '未配置下载源，请在软件更新高级设置中填写更新服务器。' }
      }
      try {
        const buf = await fetchBuffer(manifestUrl(baseUrl), { skipTlsVerify: readSkipTlsVerify() })
        const manifest = JSON.parse(buf.toString('utf8'))
        if (!manifest?.version || !manifest?.platforms) {
          return { ok: false, error: '演示工具包清单不完整' }
        }
        const key = `${process.platform}-${process.arch}`
        const altKey = process.platform === 'darwin' && process.arch === 'arm64' ? 'darwin-universal' : key
        const artifact = manifest.platforms[key] || manifest.platforms[altKey]
        if (!artifact?.url) {
          return { ok: false, error: `当前平台 ${key} 暂无演示工具包` }
        }
        const local = readInstalledMeta(getInstallRoot())
        return {
          ok: true,
          version: manifest.version,
          notes: manifest.notes || '',
          artifact,
          baseUrl,
          updateAvailable: !local?.version || local.version !== manifest.version,
          installedVersion: local?.version || '',
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    async downloadAndInstall() {
      const check = await this.checkRemote()
      if (!check.ok) return { ok: false, error: check.error || '检查失败' }
      const artifact = check.artifact
      const fileName = path.basename(String(artifact.url).split('?')[0]) || `report-editor-demo-pack-${check.version}.zip`
      const tempDir = getTempDir()
      fs.mkdirSync(tempDir, { recursive: true })
      const zipPath = path.join(tempDir, fileName)
      const url = artifact.url.includes('://')
        ? artifact.url
        : `${check.baseUrl.replace(/\/+$/, '')}/demo-pack/${encodeURIComponent(fileName)}`
      try {
        const buf = await fetchBuffer(url, { skipTlsVerify: readSkipTlsVerify() })
        fs.writeFileSync(zipPath, buf)
        if (artifact.sha256) {
          const got = sha256File(zipPath)
          if (got.toLowerCase() !== String(artifact.sha256).toLowerCase()) {
            return { ok: false, error: 'SHA256 校验失败，请重试或联系管理员' }
          }
        }
        const installRoot = getInstallRoot()
        const staging = path.join(tempDir, 'staging')
        if (fs.existsSync(staging)) {
          fs.rmSync(staging, { recursive: true, force: true })
        }
        await extractZip(zipPath, staging)
        if (fs.existsSync(installRoot)) {
          fs.rmSync(installRoot, { recursive: true, force: true })
        }
        fs.mkdirSync(installRoot, { recursive: true })
        for (const name of fs.readdirSync(staging)) {
          fs.renameSync(path.join(staging, name), path.join(installRoot, name))
        }
        writeInstalledMeta(installRoot, {
          version: check.version,
          installedAt: new Date().toISOString(),
          fileName,
        })
        return { ok: true, version: check.version, installPath: installRoot }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    _scriptPath(installRoot, name) {
      const ext = process.platform === 'win32' ? '.ps1' : '.sh'
      return path.join(installRoot, 'scripts', `${name}${ext}`)
    },

    async runComposeScript(name) {
      const installRoot = getInstallRoot()
      const meta = readInstalledMeta(installRoot)
      if (!meta?.version) {
        return { ok: false, error: '请先安装演示工具包。' }
      }
      const scriptPath = this._scriptPath(installRoot, name)
      if (!fs.existsSync(scriptPath)) {
        return { ok: false, error: `未找到脚本：${scriptPath}` }
      }
      try {
        if (process.platform === 'win32') {
          await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { cwd: installRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
          )
        } else {
          await execFileAsync('bash', [scriptPath], {
            cwd: installRoot,
            maxBuffer: 4 * 1024 * 1024,
          })
        }
        return { ok: true }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        const stderr = typeof e === 'object' && e && 'stderr' in e ? String(e.stderr || '') : ''
        return { ok: false, error: stderr.trim() || err.message || '脚本执行失败' }
      }
    },

    async startCompose() {
      return this.runComposeScript('start')
    },

    async stopCompose() {
      return this.runComposeScript('stop')
    },
  }
}

module.exports = { createDemoPackManager }
