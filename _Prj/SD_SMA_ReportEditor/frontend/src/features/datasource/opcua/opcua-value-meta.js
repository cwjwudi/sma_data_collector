/**
 * 从读值 API 的 attributes 提取简短数据类型标签（用于树上展示）。
 * @param {unknown} attributes
 * @returns {string}
 */
export function opcDataTypeLabelFromAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object') return ''
  const raw = attributes.data_type
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const m = s.match(/VariantType\.(\w+)/i)
  if (m && m[1]) return m[1]
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const known = {
      1: 'Boolean',
      2: 'SByte',
      3: 'Byte',
      4: 'Int16',
      5: 'UInt16',
      6: 'Int32',
      7: 'UInt32',
      8: 'Int64',
      9: 'UInt64',
      10: 'Float',
      11: 'Double',
      12: 'String',
      13: 'DateTime',
      14: 'Guid',
      15: 'ByteString',
      16: 'XmlElement',
      17: 'NodeId',
      18: 'ExpandedNodeId',
      19: 'StatusCode',
      20: 'QualifiedName',
      21: 'LocalizedText',
      22: 'ExtensionObject',
      23: 'DataValue',
      24: 'Variant',
      25: 'DiagnosticInfo',
    }
    return known[n] || s
  }
  return s.length > 28 ? `${s.slice(0, 27)}…` : s
}

/**
 * @param {{ ok?: boolean; attributes?: unknown } | null | undefined} res
 * @returns {string}
 */
export function opcDataTypeLabelFromRead(res) {
  if (!res || res.ok === false) return ''
  return opcDataTypeLabelFromAttributes(res.attributes)
}
