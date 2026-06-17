const path = require('path')

function outputPathForReportPart(filePath, partIndex, totalReports) {
  if (totalReports <= 1) return filePath
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath) || '.pdf'
  const stem = path.basename(filePath, ext)
  const part = Math.max(1, Math.floor(Number(partIndex) || 0) + 1)
  const total = Math.max(1, Math.floor(Number(totalReports) || 1))
  return path.join(dir, `${stem}_part-${part}-of-${total}${ext}`)
}

module.exports = {
  outputPathForReportPart,
}
