#Requires -Version 5.1
<#
.SYNOPSIS
  044 smoke: start Docker MariaDB and seed 80k rows (needs Docker Desktop + WSL2).
#>
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

function Require-Docker {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    throw 'docker not found. Install/start Docker Desktop and ensure docker is on PATH.'
  }
  & docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker engine not ready. Open Docker Desktop until green Running, then retry.'
  }
}

Require-Docker

$envPath = Join-Path $Root '.env'
if (-not (Test-Path $envPath)) {
  @(
    'MARIADB_ROOT_PASSWORD=report_editor_044'
    'MARIADB_DATABASE=report'
    'MARIADB_PORT=3306'
  ) | Set-Content -Path $envPath -Encoding ASCII
  Write-Host '[OK] wrote .env'
}

Write-Host '== ensure mariadb:11 image (Hub or DaoCloud mirror) =='
& docker image inspect mariadb:11 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'pull docker.io/library/mariadb:11 ...'
  & docker pull mariadb:11
  if ($LASTEXITCODE -ne 0) {
    $mirror = 'docker.m.daocloud.io/library/mariadb:11'
    Write-Host ("Hub failed; pull mirror {0} ..." -f $mirror)
    & docker pull $mirror
    if ($LASTEXITCODE -ne 0) {
      throw 'cannot pull mariadb:11 (Hub + DaoCloud failed)'
    }
    & docker tag $mirror mariadb:11
  }
}

Write-Host '== docker compose up mariadb =='
& docker compose up -d mariadb
if ($LASTEXITCODE -ne 0) {
  throw ("compose up failed: {0}" -f $LASTEXITCODE)
}

Write-Host '== wait healthy =='
$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 3
  $st = (& docker inspect -f '{{.State.Health.Status}}' report_editor_mariadb 2>$null)
  if (-not $st) { $st = 'starting' }
  Write-Host ("health={0}" -f $st)
  if ($st -eq 'healthy') { break }
} while ((Get-Date) -lt $deadline)

if ($st -ne 'healthy') {
  throw ("mariadb not healthy within timeout (status={0})" -f $st)
}

$pyCandidates = @(
  (Join-Path $Root 'backend\venv\Scripts\python.exe'),
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  'python'
)
$py = $pyCandidates | Where-Object { $_ -eq 'python' -or (Test-Path $_) } | Select-Object -First 1
if (-not $py) { throw 'Python not found' }

Write-Host '== pip pymysql / cryptography =='
& $py -m pip install -q pymysql cryptography pydantic

Write-Host '== seed 80k + template =='
$env:MARIADB_ROOT_PASSWORD = 'report_editor_044'
& $py (Join-Path $Root 'scripts\dev\setup_044_smoke_80k.py')
if ($LASTEXITCODE -ne 0) {
  throw ("setup_044_smoke_80k.py exit {0}" -f $LASTEXITCODE)
}

Write-Host ''
Write-Host '[OK] 044 Docker ready. Restart Report Editor AI, export template: test 044 80k split (MariaDB).'
