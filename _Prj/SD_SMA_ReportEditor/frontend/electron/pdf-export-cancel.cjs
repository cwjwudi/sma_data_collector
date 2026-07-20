/**
 * PDF 导出取消登记（032 P1-D）。
 * jobId → { cancelled }；主进程在分卷间隙检查。
 */
'use strict'

/** @type {Map<string, { cancelled: boolean }>} */
const jobs = new Map()

/**
 * @param {string} jobId
 * @returns {{ cancelled: boolean }}
 */
function registerPdfExportJob(jobId) {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('缺少 jobId')
  const state = { cancelled: false }
  jobs.set(id, state)
  return state
}

/**
 * @param {string} jobId
 * @returns {boolean} 是否找到并标记取消
 */
function cancelPdfExportJob(jobId) {
  const id = String(jobId || '').trim()
  if (!id) return false
  const state = jobs.get(id)
  if (!state) return false
  state.cancelled = true
  return true
}

/**
 * @param {string} jobId
 * @returns {boolean}
 */
function isPdfExportCancelled(jobId) {
  const id = String(jobId || '').trim()
  if (!id) return false
  return Boolean(jobs.get(id)?.cancelled)
}

/**
 * @param {string} jobId
 */
function unregisterPdfExportJob(jobId) {
  const id = String(jobId || '').trim()
  if (id) jobs.delete(id)
}

function resetPdfExportCancelForTests() {
  jobs.clear()
}

module.exports = {
  registerPdfExportJob,
  cancelPdfExportJob,
  isPdfExportCancelled,
  unregisterPdfExportJob,
  resetPdfExportCancelForTests,
}
