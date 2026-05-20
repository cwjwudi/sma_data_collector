# 开发用后端：在 PowerShell 中运行，避免旧版 cmd「快速编辑」点选导致进程挂起、窗口关不掉。
# 用法：由 scripts\dev\windows\start_dev_web.bat 启动，或: powershell -NoProfile -ExecutionPolicy Bypass -File .\dev_uvicorn.ps1
$ErrorActionPreference = 'Stop'
$BackendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $BackendRoot

if (-not (Test-Path (Join-Path $BackendRoot 'main.py'))) {
  Write-Host "[错误] 未在 backend 目录找到 main.py，请确认本脚本位于 backend\scripts\ 下。" -ForegroundColor Red
  exit 1
}

$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
$env:PYTHONUTF8 = '1'
$env:REPORT_EDITOR_HTTP_PORT = '8000'

$py = Join-Path $BackendRoot 'venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

Write-Host 'SD_SMA_ReportEditor 后端 http://127.0.0.1:8000' -ForegroundColor Cyan
Write-Host '停止：在本窗口按 Ctrl+C。若按键无效，先按 Esc 退出「选择」再试。' -ForegroundColor DarkGray
Write-Host ''

try {
  & $py -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
} finally {
  Write-Host ''
  Write-Host '后端进程已结束。' -ForegroundColor Yellow
}
