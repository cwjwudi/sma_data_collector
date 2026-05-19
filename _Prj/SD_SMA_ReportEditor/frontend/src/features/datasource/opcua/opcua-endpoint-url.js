/** OPC UA 默认端口（与常见服务器一致） */
export const DEFAULT_OPCUA_PORT = 4840

/**
 * 解析 opc.tcp://host:port/path 为表单字段；无法识别时 host 留空、port 为默认。
 * @param {string} raw
 * @returns {{ host: string, portText: string, path: string }}
 */
export function parseOpcEndpointUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) {
    return { host: '', portText: String(DEFAULT_OPCUA_PORT), path: '' }
  }
  let rest = s
  if (/^opc\.tcp:\/\//i.test(rest)) {
    rest = rest.replace(/^opc\.tcp:\/\//i, '')
  } else if (/^opc\.tcp:/i.test(rest)) {
    rest = rest.replace(/^opc\.tcp:/i, '')
  }

  let path = ''
  const slash = rest.indexOf('/')
  if (slash >= 0) {
    path = rest.slice(slash + 1).replace(/^\/+/, '')
    rest = rest.slice(0, slash)
  }

  let host = rest.trim()
  let port = DEFAULT_OPCUA_PORT
  if (host.startsWith('[')) {
    const m = host.match(/^\[([^\]]+)\]:(\d+)$/)
    if (m) {
      host = m[1]
      port = Number.parseInt(m[2], 10) || DEFAULT_OPCUA_PORT
    }
  } else {
    const colon = host.lastIndexOf(':')
    if (colon > 0) {
      const portPart = host.slice(colon + 1)
      if (/^\d+$/.test(portPart)) {
        port = Number.parseInt(portPart, 10) || DEFAULT_OPCUA_PORT
        host = host.slice(0, colon)
      }
    }
  }

  return {
    host: host.trim(),
    portText: String(port),
    path: path.trim(),
  }
}

/**
 * 由主机、端口、可选路径组装 Endpoint URL（仍按 opc.tcp 存配置）。
 * @param {{ host?: string, portText?: string, path?: string }} fields
 * @returns {string}
 */
export function buildOpcEndpointUrl(fields) {
  const host = String(fields?.host ?? '').trim()
  if (!host) return ''

  let portRaw = String(fields?.portText ?? '').trim()
  if (!portRaw) portRaw = String(DEFAULT_OPCUA_PORT)
  let port = Number.parseInt(portRaw, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    port = DEFAULT_OPCUA_PORT
  }

  const path = String(fields?.path ?? '')
    .trim()
    .replace(/^\/+/, '')

  const base = `opc.tcp://${host}:${port}`
  return path ? `${base}/${path}` : base
}

/** 连接芯片/列表用的简短标签 */
export function opcServerShortLabel(server) {
  if (!server) return 'OPC UA'
  const name = String(server.name || '').trim()
  if (name) return name
  const p = parseOpcEndpointUrl(server.endpoint_url)
  if (!p.host) return String(server.endpoint_url || '').trim() || 'OPC UA'
  return p.path ? `${p.host}:${p.portText}/${p.path}` : `${p.host}:${p.portText}`
}
