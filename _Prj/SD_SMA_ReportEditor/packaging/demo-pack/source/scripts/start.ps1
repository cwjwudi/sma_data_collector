$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 docker 命令，请先安装并启动 Docker Desktop。"
}
docker compose up -d --build
Write-Host ""
Write-Host "演示环境已启动。"
Write-Host "  MariaDB: 127.0.0.1:3306 / 库 report"
Write-Host "  OPC UA:  opc.tcp://127.0.0.1:4840/report-editor/demo-opcua/"
