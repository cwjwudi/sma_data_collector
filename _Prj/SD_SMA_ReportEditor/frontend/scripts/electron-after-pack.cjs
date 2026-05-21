/**
 * electron-builder afterPack：在不下载 winCodeSign 的情况下为 Windows exe 写入图标。
 * signAndEditExecutable 会触发 winCodeSign 解压，部分 Windows 环境无创建符号链接权限会失败。
 */
const fs = require('fs')
const path = require('path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const iconIco = path.join(context.packager.projectDir, 'build', 'icon.ico')
  if (!fs.existsSync(iconIco)) {
    console.warn('[afterPack] skip: build/icon.ico not found')
    return
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = path.join(context.appOutDir, exeName)
  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] skip: exe not found at', exePath)
    return
  }

  let rcedit
  try {
    rcedit = require('rcedit')
  } catch (e) {
    throw new Error(
      '缺少 rcedit 依赖，无法写入 exe 图标。请在 frontend 目录执行 npm ci。',
      { cause: e },
    )
  }

  console.log('[afterPack] rcedit icon ->', exePath)
  await rcedit(exePath, { icon: iconIco })
}
