/**
 * 历史报表缩略图 IPC 并发槽（032 P1-B / L5）。
 * 默认最多 2 路并行，避免多卡同时 readFile / createThumbnail 堵主进程。
 */
'use strict'

const THUMB_MAX_CONCURRENCY = 2

let active = 0
/** @type {Array<() => void>} */
const waiters = []

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withThumbSlot(fn) {
  if (active >= THUMB_MAX_CONCURRENCY) {
    await new Promise((resolve) => {
      waiters.push(resolve)
    })
  }
  active += 1
  try {
    return await fn()
  } finally {
    active -= 1
    const next = waiters.shift()
    if (next) next()
  }
}

/** @returns {{ active: number, waiting: number, max: number }} */
function thumbQueueStats() {
  return { active, waiting: waiters.length, max: THUMB_MAX_CONCURRENCY }
}

function resetThumbQueueForTests() {
  active = 0
  waiters.length = 0
}

module.exports = {
  THUMB_MAX_CONCURRENCY,
  withThumbSlot,
  thumbQueueStats,
  resetThumbQueueForTests,
}
