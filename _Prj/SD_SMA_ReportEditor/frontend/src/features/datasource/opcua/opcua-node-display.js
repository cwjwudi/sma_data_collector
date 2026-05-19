/** 从 NodeId 字符串解析 ns 与标识（i / s / g / b） */
export function parseOpcNodeId(nodeId) {
  const s = String(nodeId || '').trim()
  const out = { ns: '', identifier: '', idKind: '' }
  if (!s) return out
  const nsM = s.match(/ns=(\d+)/i)
  if (nsM) out.ns = nsM[1]
  const iM = s.match(/;i=([^;]+)/i)
  const sM = s.match(/;s=([^;]+)/i)
  const gM = s.match(/;g=([^;]+)/i)
  const bM = s.match(/;b=([^;]+)/i)
  if (iM) {
    out.idKind = 'i'
    out.identifier = iM[1]
  } else if (sM) {
    out.idKind = 's'
    out.identifier = sM[1]
  } else if (gM) {
    out.idKind = 'g'
    out.identifier = gM[1]
  } else if (bM) {
    out.idKind = 'b'
    out.identifier = bM[1]
  }
  return out
}

const NODE_CLASS_ZH = {
  OBJECT: '对象',
  VARIABLE: '变量',
  METHOD: '方法',
  OBJECTTYPE: '对象类型',
  VARIABLETYPE: '变量类型',
  REFERENCETYPE: '引用类型',
  DATATYPE: '数据类型',
  VIEW: '视图',
  FOLDER: '文件夹',
}

const NODE_CLASS_NUM_ZH = {
  1: '对象',
  2: '变量',
  4: '方法',
}

/** 节点类型中文（BrowseName / NodeClass） */
export function opcNodeClassLabel(nodeClass) {
  if (nodeClass === null || nodeClass === undefined) return '—'
  if (typeof nodeClass === 'number' && Number.isFinite(nodeClass)) {
    return NODE_CLASS_NUM_ZH[Math.trunc(nodeClass)] || `类型 ${nodeClass}`
  }
  const s = String(nodeClass).trim()
  if (!s) return '—'
  const token = (s.includes('.') ? s.split(/[.\s/]+/).pop() : s) || s
  const key = token.toUpperCase()
  if (NODE_CLASS_ZH[key]) return NODE_CLASS_ZH[key]
  return token
}
