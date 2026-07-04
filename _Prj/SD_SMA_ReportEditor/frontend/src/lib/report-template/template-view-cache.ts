/**
 * 模板管理页的跨导航内存缓存：切走再切回时先用上次的摘要与缩略图数据「秒显示」，
 * 后台再按 updatedAt 只刷新有变化的模板，避免每次进入页面都空白等待。
 * 仅进程内存，不落盘；页面卸载时写回、进入时读取。
 */

export type TemplateSummaryLite = {
  id: string
  name?: string
  updatedAt?: string
  paperKind?: string
  orientation?: string
  [k: string]: unknown
}

let summariesCache: TemplateSummaryLite[] = []
let fullCache: Record<string, unknown> = {}
let seeded = false

export function hasTemplateViewCache(): boolean {
  return seeded
}

export function getCachedTemplateSummaries(): TemplateSummaryLite[] {
  return summariesCache
}

export function getCachedTemplateFullMap(): Record<string, unknown> {
  return fullCache
}

/** 页面卸载时写回当前状态（含本地编辑/排序后的结果） */
export function saveTemplateViewCache(
  summaries: TemplateSummaryLite[],
  full: Record<string, unknown>,
): void {
  summariesCache = Array.isArray(summaries) ? [...summaries] : []
  fullCache = full && typeof full === 'object' ? { ...full } : {}
  seeded = true
}

export function clearTemplateViewCache(): void {
  summariesCache = []
  fullCache = {}
  seeded = false
}
