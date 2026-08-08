#Requires -Version 5.1
<#
.SYNOPSIS
  044 冒烟：启动 Docker MariaDB（需 Docker Desktop + WSL2 已就绪）

.DESCRIPTION
  1. 检查 docker 可用
  2. 在 SD_SMA_ReportEditor 目录 compose up mariadb
  3. 调用 setup_044_smoke_80k.py 灌库 + 写连接 + 写模版
#>
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

function Require-Docker {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    throw "找不到 docker。请先安装并启动 Docker Desktop，并把 docker 加入 PATH。"
  }
  & docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw @"
Docker 引擎未就绪（常见原因：未装 WSL2，或 Desktop 未完成首次引导）。

请在「管理员 PowerShell」执行：
  wsl --install
然后重启电脑，打开 Docker Desktop 等到绿色 Running，再重跑本脚本。
"@
  }
}

Require-Docker

if (-not (Test-Path (Join-Path $Root '.env'))) {
  @"
MARIADB_ROOT_PASSWORD=report_editor_044
MARIADB_DATABASE=report
MARIADB_PORT=3306
"@ | Set-Content -Path (Join-Path $Root '.env') -Encoding UTF8
  Write-Host '[OK] wrote .env'
}

Write-Host '== docker compose up mariadb =='
& docker compose up -d mariadb
if ($LASTEXITCODE -ne 0) { throw "compose up failed: $LASTEXITCODE" }

$pyCandidates = @(
  (Join-Path $Root 'backend\venv\Scripts\python.exe'),
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  'python'
)
$py = $pyCandidates | Where-Object { $_ -eq 'python' -or (Test-Path $_) } | Select-Object -First 1
if (-not $py) { throw '未找到 Python' }

Write-Host "== pip pymysql / cryptography (venv if present) =="
& $py -m pip install -q pymysql cryptography pydantic

Write-Host '== seed 80k + template =='
& $py (Join-Path $Root 'scripts\dev\setup_044_smoke_80k.py')
if ($LASTEXITCODE -ne 0) { throw "setup_044_smoke_80k.py exit $LASTEXITCODE" }

Write-Host ''
Write-Host '[OK] 044 Docker 环境就绪。重启 Report Editor AI 后导出模版「测试·044·8万条分卷导出」。'
