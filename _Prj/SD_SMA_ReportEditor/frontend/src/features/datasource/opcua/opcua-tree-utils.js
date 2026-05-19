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

/** 地址空间中可能还有可浏览子节点的类型（Object/Folder 等） */
export function isOpcObjectLikeBrowseNode(n) {
  if (!n || isOpcVariableValueNode(n)) return false
  const u = String(n.node_class || '')
    .trim()
    .toUpperCase()
  if (!u) return true
  if (u.includes('VARIABLETYPE')) return false
  if (u.includes('METHOD')) return false
  if (u.includes('DATATYPE')) return false
  if (u.includes('REFERENCETYPE')) return false
  return true
}

/**
 * 树行是否显示展开箭头：已浏览且无子节点（含过滤后为空）则不显示。
 * @param {any} node
 */
export function opcTreeNodeHasExpander(node) {
  if (!node) return false
  if (node.browseLeaf) return false
  if (node.loading) return true
  if (node.loaded) {
    return (node.children?.length ?? 0) > 0
  }
  return isOpcObjectLikeBrowseNode(node)
}

/** 递归收起树中所有已展开节点（保留已加载子节点数据） */
export function collapseOpcTreeNodes(nodes) {
  for (const n of nodes || []) {
    n.expanded = false
    n.loading = false
    if (Array.isArray(n.children) && n.children.length) {
      collapseOpcTreeNodes(n.children)
    }
  }
}

/** 浏览完成后写入子节点，并在无子节点时标记为叶子、收起展开 */
export function applyOpcBrowseChildren(node, children) {
  const list = children || []
  node.children = list
  node.loaded = true
  node.browseLeaf = list.length === 0
  node.expanded = list.length > 0
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
/** 节点上的数据类型标签是否匹配过滤（如 String） */
export function opcDataTypeLabelMatchesFilter(label, filter) {
  const f = String(filter || '').trim().toLowerCase()
  if (!f) return true
  const l = String(label || '').trim().toLowerCase()
  if (!l) return false
  if (l === f) return true
  if (l.endsWith(`.${f}`) || l.endsWith(`:${f}`)) return true
  const tail = l.split(/[^a-z0-9]+/).pop()
  return tail === f
}

/** 浏览子节点在 dataTypeFilter 下是否应显示（非 Variable 始终显示以便展开） */
export function shouldShowOpcBrowseChild(node, dataTypeFilter) {
  if (!dataTypeFilter) return true
  if (!isOpcVariableValueNode(node)) return true
  return opcDataTypeLabelMatchesFilter(node.valueDataTypeLabel, dataTypeFilter)
}

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
