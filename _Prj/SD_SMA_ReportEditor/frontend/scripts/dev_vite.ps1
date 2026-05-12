# 开发用前端 Vite（由 start_dev_web.bat 启动，避免 cmd /k + 快速编辑导致关不掉）
$ErrorActionPreference = 'Stop'
$FrontendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $FrontendRoot

if (-not (Test-Path (Join-Path $FrontendRoot 'package.json'))) {
  Write-Host "[错误] 未找到 package.json，请确认本脚本位于 frontend\scripts\ 下。" -ForegroundColor Red
  exit 1
}

$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'

Write-Host 'SD_SMA_ReportEditor 前端 http://localhost:5173' -ForegroundColor Cyan
Write-Host '停止：在本窗口按 Ctrl+C。' -ForegroundColor DarkGray
Write-Host ''

try {
  & npm.cmd run dev
} finally {
  Write-Host ''
  Write-Host '前端开发服已结束。' -ForegroundColor Yellow
}
