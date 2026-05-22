/** PDF 导出错误可读化（与 src/lib/pdfExportErrors.ts 保持文案一致） */

function norm(raw) {
  return String(raw ?? '').trim()
}

function lower(raw) {
  return norm(raw).toLowerCase()
}

function humanizePdfExportError(raw, context) {
  let text = norm(raw)
  if (!text && raw && typeof raw === 'object' && raw.message) {
    text = norm(raw.message)
  }
  if (!text) text = '未知错误'
  const low = lower(text)
  const phase = (context && context.phase) || 'export'

  if (/pdf\s*渲染超时|渲染超时/.test(text)) {
    return [
      'PDF 渲染超时（超过 2 分钟）。',
      '可能原因：模版较大、数据源响应慢或网络不稳定。',
      '建议：检查数据库 / OPC UA 连接是否正常，关闭其他占用资源的程序后重试。',
    ].join('\n')
  }
  if (/pdf\s*渲染失败|渲染失败/.test(low)) {
    return [
      'PDF 渲染失败。',
      `原因：${text}`,
      '建议：在模版编辑器中打开「导出预览」确认能否正常显示；若绑定报错请先修复数据源连接。',
    ].join('\n')
  }
  if (/缺少 templateid/i.test(text)) {
    return '未指定要导出的报表模版，请重新选择模版后再试。'
  }
  if (/缺少 filepath/i.test(text)) {
    return '未指定 PDF 保存路径，请重新选择保存位置。'
  }
  if (/404|not found|未找到.*模版|template.*not found/i.test(text)) {
    return '找不到指定的报表模版，可能已被删除或尚未同步。请刷新模版列表后重试。'
  }
  if (/enotfound|enoent|no such file/i.test(low)) {
    return phase === 'save'
      ? '无法写入 PDF 文件，目标路径不存在或无权限。请更换保存目录后重试。'
      : '找不到相关文件，请确认模版与导出目录是否有效。'
  }
  if (/enospc|no space/i.test(low)) {
    return '磁盘空间不足，无法保存 PDF。请清理磁盘后重试。'
  }
  if (/eperm|eacces|permission denied|operation not permitted/i.test(low)) {
    return '没有权限写入 PDF 文件。请更换保存目录，或关闭可能占用文件的程序后重试。'
  }
  if (/timed out|timeout|etimedout/i.test(low)) {
    return '导出超时。请检查数据库 / OPC UA 连接与网络，然后重试。'
  }
  if (/failed to fetch|network|econnrefused|getaddrinfo|无法连接/i.test(low)) {
    return '无法连接后端或数据源。请确认软件后端已启动，并在「数据源配置」中测试连接。'
  }
  if (/绑定|数据源|连接.*失败|opc|sql/i.test(text)) {
    return [
      '导出前数据源检查未通过。',
      text,
      '建议：前往「数据源配置」测试相关连接，或在模版编辑器查看「导出预览」中的报错单元格。',
    ].join('\n')
  }
  return text
}

module.exports = { humanizePdfExportError }
