/**
 * 是否为可进行 Value 读取的 Variable 实例（排除 VariableType）。
 * node_class 在不同服务器/asyncua 序列化下可能是 "Variable"、数字枚举、"NodeClass.Variable" 等。
 */
export function isOpcVariableValueNode(n) {
  const raw = n?.node_class
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'number' && Number.isFinite(raw) && Math.trunc(raw) === 2) {
    return true
  }
  const s = String(raw).trim()
  if (!s) return false
  const u = s.toUpperCase()
  if (u.includes('VARIABLETYPE')) return false
  const token = u.split(/[.\s/]+/).pop() || ''
  return token === 'VARIABLE' || token === '2'
}

/**
 * 收集当前内存里「已加载」子树的扁平列表（含路径），用于绑定场景下本地搜索。
 * @param {any[]} nodes
 * @param {string[]} pathParts
 * @param {{ node: any; pathStr: string }[]} [out]
 */
export function collectOpcLoadedNodesFlat(nodes, pathParts = [], out = []) {
  for (const n of nodes || []) {
    const label = String(n.display_name || n.browse_name || n.node_id || '').trim() || '—'
    const pathStr = [...pathParts, label].join(' → ')
    out.push({ node: n, pathStr })
    if (n.loaded && Array.isArray(n.children) && n.children.length) {
      collectOpcLoadedNodesFlat(n.children, [...pathParts, label], out)
    }
  }
  return out
}

/**
 * @param {any[]} nodesRoot
 * @param {string} query
 * @param {number} [max]
 */
export function filterOpcNodesBySearch(nodesRoot, query, max = 250) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const flat = collectOpcLoadedNodesFlat(nodesRoot, [], [])
  const hits = []
  for (const { node, pathStr } of flat) {
    const hay =
      `${pathStr} ${node.display_name || ''} ${node.browse_name || ''} ${node.node_id || ''} ${node.valuePreview || ''} ${node.valueDataTypeLabel || ''}`.toLowerCase()
    if (hay.includes(q)) {
      hits.push({ node, pathStr })
      if (hits.length >= max) break
    }
  }
  return hits
}
