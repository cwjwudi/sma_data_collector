import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { humanizeUpdateError } = require('../../../../electron/updater.cjs')

describe('humanizeUpdateError', () => {
  it('maps EPERM to readable hint', () => {
    const msg = humanizeUpdateError(Object.assign(new Error('EPERM'), { code: 'EPERM' }), {
      destPath: 'C:\\Temp\\report-editor-updates\\Report%20Editor-Setup.exe',
      updateDir: 'C:\\Temp\\report-editor-updates',
    })
    expect(msg).toContain('权限不足')
    expect(msg).toContain('临时目录')
    expect(msg).toContain('异常编码')
  })

  it('maps ENOSPC', () => {
    expect(humanizeUpdateError({ code: 'ENOSPC', message: 'ENOSPC' })).toContain('磁盘空间不足')
  })

  it('maps network errors', () => {
    expect(humanizeUpdateError(new Error('getaddrinfo ENOTFOUND example.com'))).toContain(
      '无法连接更新服务器',
    )
  })
})
