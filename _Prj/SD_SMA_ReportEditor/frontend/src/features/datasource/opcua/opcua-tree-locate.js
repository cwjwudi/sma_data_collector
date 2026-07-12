/**
 * 按已配置 NodeId 在懒加载 OPC 树中展开祖先并返回目标节点。
 * 定位过程使用不带 data_type 过滤的 browse，避免筛掉路径节点。
 */

/**
 * @param {string} a
 * @param {string} b
 */
export function opcNodeIdsEqual(a, b) {
  return String(a || '').trim() === String(b || '').trim()
}

/**
 * 在已加载子节点中按 NodeId 查找。
 * @param {any[]} nodes
 * @param {string} nodeId
 */
export function findOpcChildByNodeId(nodes, nodeId) {
  const want = String(nodeId || '').trim()
  if (!want) return null
  for (const n of nodes || []) {
    if (opcNodeIdsEqual(n?.node_id, want)) return n
  }
  return null
}

/**
 * 将 raw 子节点合并进 parent（或作为新根列表），保留已有展开态；按 NodeId 去重。
 * @param {any[]|null} existing
 * @param {any[]} incomingWrapped
 */
export function mergeOpcTreeChildren(existing, incomingWrapped) {
  const out = []
  const seen = new Set()
  for (const n of existing || []) {
    const id = String(n?.node_id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(n)
  }
  for (const n of incomingWrapped || []) {
    const id = String(n?.node_id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(n)
  }
  return out
}

/**
 * @param {object} opts
 * @param {string} opts.targetNodeId
 * @param {() => any[]} opts.getRootNodes
 * @param {(nodes: any[]) => void} opts.setRootNodes
 * @param {() => Promise<{ ok?: boolean, path?: any[], error?: string, message?: string }>} opts.resolvePath
 * @param {(parentNodeId: string|null) => Promise<any[]>} opts.browseUnfiltered — 返回已 wrap 的子节点列表
 * @param {(parent: any, children: any[]) => void} opts.applyChildren
 * @param {() => void} opts.bumpTree
 * @param {() => boolean} [opts.shouldAbort]
 * @returns {Promise<{ ok: boolean, node?: any, error?: string }>}
 */
export async function locateConfiguredOpcNodeInTree({
  targetNodeId,
  getRootNodes,
  setRootNodes,
  resolvePath,
  browseUnfiltered,
  applyChildren,
  bumpTree,
  shouldAbort,
}) {
  const target = String(targetNodeId || '').trim()
  if (!target) return { ok: false, error: '' }

  const aborted = () => (typeof shouldAbort === 'function' ? shouldAbort() : false)

  let resolved
  try {
    resolved = await resolvePath()
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
  if (aborted()) return { ok: false, error: 'aborted' }
  if (!resolved || resolved.ok === false) {
    return {
      ok: false,
      error: resolved?.error || resolved?.message || '无法解析节点路径',
    }
  }
  const path = Array.isArray(resolved.path) ? resolved.path : []
  if (!path.length) {
    return { ok: false, error: '节点路径为空' }
  }

  // 确保根层含有路径首节点（无类型过滤）
  let roots = getRootNodes() || []
  const firstId = path[0]?.node_id
  if (firstId && !findOpcChildByNodeId(roots, firstId)) {
    const freshRoot = await browseUnfiltered(null)
    if (aborted()) return { ok: false, error: 'aborted' }
    roots = mergeOpcTreeChildren(roots, freshRoot)
    setRootNodes(roots)
    bumpTree()
  }

  let currentLevel = getRootNodes() || []
  let foundLeaf = null

  for (let i = 0; i < path.length; i++) {
    if (aborted()) return { ok: false, error: 'aborted' }
    const stepId = String(path[i]?.node_id || '').trim()
    if (!stepId) {
      return { ok: false, error: '路径段缺少 node_id' }
    }
    let hit = findOpcChildByNodeId(currentLevel, stepId)
    if (!hit) {
      return { ok: false, error: `地址空间中未找到节点：${stepId}` }
    }

    const isLast = i === path.length - 1
    if (isLast) {
      foundLeaf = hit
      break
    }

    // 展开祖先：必要时无无过滤 browse 拉取子节点
    if (!hit.loaded) {
      hit.loading = true
      bumpTree()
      try {
        const kids = await browseUnfiltered(hit.node_id)
        if (aborted()) return { ok: false, error: 'aborted' }
        applyChildren(hit, kids)
      } catch (e) {
        hit.errorMessage = e?.message || String(e)
        applyChildren(hit, [])
        return { ok: false, error: hit.errorMessage }
      } finally {
        hit.loading = false
        bumpTree()
      }
    } else {
      // 已加载但可能被类型过滤缺了路径子节点：补一次无过滤 merge
      const nextId = String(path[i + 1]?.node_id || '').trim()
      if (nextId && !findOpcChildByNodeId(hit.children || [], nextId)) {
        hit.loading = true
        bumpTree()
        try {
          const kids = await browseUnfiltered(hit.node_id)
          if (aborted()) return { ok: false, error: 'aborted' }
          const merged = mergeOpcTreeChildren(hit.children, kids)
          applyChildren(hit, merged)
        } catch (e) {
          hit.errorMessage = e?.message || String(e)
          return { ok: false, error: hit.errorMessage }
        } finally {
          hit.loading = false
          bumpTree()
        }
      } else {
        hit.expanded = true
        bumpTree()
      }
    }

    if (!(hit.children?.length > 0)) {
      return { ok: false, error: `节点无子节点，无法继续展开：${stepId}` }
    }
    hit.expanded = true
    bumpTree()
    currentLevel = hit.children
  }

  if (!foundLeaf) {
    return { ok: false, error: '未能定位到目标节点' }
  }
  return { ok: true, node: foundLeaf }
}
