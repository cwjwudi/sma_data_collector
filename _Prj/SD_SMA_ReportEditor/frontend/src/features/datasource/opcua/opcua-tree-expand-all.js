import { isOpcObjectLikeBrowseNode } from './opcua-tree-utils.js'

export const OPC_TREE_EXPAND_ALL_MAX_BROWSE = 350
export const OPC_TREE_EXPAND_ALL_MAX_DEPTH = 40

export function enqueueOpcExpandAllChildren(node, depth, queue, maxDepth = OPC_TREE_EXPAND_ALL_MAX_DEPTH) {
  if (!node.expanded || depth >= maxDepth) return
  for (const ch of node.children || []) {
    if (ch.browseLeaf) continue
    if (ch.loaded) {
      if ((ch.children?.length ?? 0) > 0) queue.push({ node: ch, depth: depth + 1 })
    } else if (isOpcObjectLikeBrowseNode(ch)) {
      queue.push({ node: ch, depth: depth + 1 })
    }
  }
}

/**
 * BFS 浏览并展开地址空间树。
 * @param {object} opts
 * @param {any[]} opts.rootNodes
 * @param {(node: any) => Promise<void>} opts.fetchChildren
 * @param {() => void} opts.bumpTree
 * @param {() => boolean} opts.shouldAbort
 * @param {(text: string) => void} [opts.onProgress]
 * @returns {Promise<'done' | 'capped' | 'aborted'>}
 */
export async function runOpcExpandAllTree({
  rootNodes,
  fetchChildren,
  bumpTree,
  shouldAbort,
  onProgress,
}) {
  let browsed = 0
  const queue = []
  for (const n of rootNodes || []) {
    if (n.browseLeaf) continue
    if (n.loaded && (n.children?.length ?? 0) > 0) {
      n.expanded = true
      enqueueOpcExpandAllChildren(n, 0, queue)
    } else if (isOpcObjectLikeBrowseNode(n)) {
      queue.push({ node: n, depth: 0 })
    }
  }
  bumpTree()

  while (queue.length && browsed < OPC_TREE_EXPAND_ALL_MAX_BROWSE) {
    if (shouldAbort()) return 'aborted'
    const { node, depth } = queue.shift()
    if (node.browseLeaf || depth > OPC_TREE_EXPAND_ALL_MAX_DEPTH) continue

    if (!node.loaded) {
      if (!isOpcObjectLikeBrowseNode(node)) continue
      browsed += 1
      node.loading = true
      bumpTree()
      try {
        await fetchChildren(node)
      } catch (e) {
        node.errorMessage = e?.message || String(e)
        node.children = []
        node.loaded = true
        node.browseLeaf = true
        node.expanded = false
      } finally {
        node.loading = false
      }
      if (shouldAbort()) return 'aborted'
      onProgress?.(`正在展开…（已浏览 ${browsed} 个节点）`)
      bumpTree()
    } else if ((node.children?.length ?? 0) > 0) {
      node.expanded = true
      bumpTree()
    }

    enqueueOpcExpandAllChildren(node, depth, queue)
  }

  if (shouldAbort()) return 'aborted'
  if (browsed >= OPC_TREE_EXPAND_ALL_MAX_BROWSE && queue.length > 0) return 'capped'
  return 'done'
}
