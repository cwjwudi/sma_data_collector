/** 运行环境检查结果（内存缓存，刷新页面后清空） */
let environmentCheckCache = null

export function getEnvironmentCheckCache() {
  return environmentCheckCache
}

export function setEnvironmentCheckCache(payload) {
  if (!payload) {
    environmentCheckCache = null
    return
  }
  environmentCheckCache = {
    checks: Array.isArray(payload.checks) ? [...payload.checks] : [],
    nodeTools: payload.nodeTools ? { ...payload.nodeTools } : { node: null, npm: null },
    errorMsg: typeof payload.errorMsg === 'string' ? payload.errorMsg : '',
  }
}

export function clearEnvironmentCheckCache() {
  environmentCheckCache = null
}

export function hasEnvironmentCheckCache() {
  return environmentCheckCache != null
}
