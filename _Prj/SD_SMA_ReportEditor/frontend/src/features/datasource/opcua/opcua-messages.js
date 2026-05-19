/**
 * 将 OPC UA / 网络 / asyncua 常见英文报错转为简短中文说明（无法识别时保留原文）。
 * @param {unknown} raw
 * @returns {string}
 */
export function translateOpcuaMessage(raw) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''

  const lower = s.toLowerCase()

  if (/[\u4e00-\u9fff]/.test(s) && !/bad_/i.test(s) && !/opc ua/i.test(lower)) {
    return s
  }

  if (/endpoint/i.test(s) && /(invalid|unreachable|not found)/i.test(s)) {
    return 'Endpoint 无效或不可达'
  }
  if (/fetch/i.test(lower) && /abort/i.test(lower)) {
    return '请求已中断'
  }

  /** @type {Array<[RegExp, string]>} */
  const rules = [
    [/bad_nodeidunknown|badnodeidunknown/i, '未知的节点 ID'],
    [/bad_attributeidinvalid/i, '属性标识无效'],
    [
      /badnotsupported|requested operation is not supported/i,
      '服务器不支持对该节点的此项操作（BadNotSupported）。常见于：节点虽显示为变量，但未实现标准「读值」；可能需通过 Method、历史读或其它厂商专用接口访问，请参阅 OPC 服务端文档。',
    ],
    [/bad_notreadable|badnotreadable/i, '节点不可读（权限或变量类型限制）'],
    [/bad_notwritable|badnotwritable/i, '节点不可写'],
    [/bad_useraccessdenied|baduseraccessdenied/i, '用户访问被拒绝'],
    [/bad_securitychecksfailed/i, '安全校验失败'],
    [/bad_session(?:id)?invalid/i, '会话无效或已过期，请重新连接'],
    [/bad_serveruriinvalid/i, '服务器 URI 无效'],
    [/bad_identitytoken(?:rejected|invalid)/i, '身份令牌无效或被拒绝'],
    [/certificate|cert verify|ssl|tls|handshake/i, '证书或 TLS 握手失败'],
    [/timeout|timed out/i, '连接或操作超时'],
    [/connection refused/i, '连接被拒绝（服务未监听或地址错误）'],
    [/network is unreachable|ehostunreach/i, '网络不可达'],
    [/cannot connect|failed to connect|connect error/i, '无法连接到服务器'],
    [/failed to fetch|networkerror|load failed/i, '请求失败（检查后端是否启动或跨域）'],
    [/invalid response|unexpected token/i, '响应格式无效'],
    [/browse failed/i, '浏览子节点失败'],
    [/read failed|failed to read/i, '读取节点值失败'],
  ]

  for (const [re, zh] of rules) {
    if (re.test(s)) return zh
  }

  if (/^\s*\{/.test(s) && /"message"\s*:/.test(s)) {
    try {
      const j = JSON.parse(s)
      const m = j?.message ?? j?.detail
      if (typeof m === 'string' && m.trim()) return translateOpcuaMessage(m)
    } catch {
      /* ignore */
    }
  }

  return s
}
