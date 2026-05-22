# Build SD SMA Report Editor Windows NSIS installer (Setup.exe).
# ASCII-only for Windows PowerShell 5.1 compatibility.
#
# Output: packaging/windows/output/SD SMA Report Editor-Setup-<version>-x64.exe

[CmdletBinding()]
param(
  [switch]$SkipFrontendInstall,
  [switch]$SkipBackendBuild,
  [switch]$Fresh,
  [string]$NpmRegistry = 'https://registry.npmmirror.com',
  [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/'
)

$ErrorActionPreference = 'Stop'

$PackagingDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $PackagingDir '..\..')).Path
$OutputDir = Join-Path $PackagingDir 'output'
$Frontend = Join-Path $Root 'frontend'
$Backend = Join-Path $Root 'backend'
$BackendExe = Join-Path $Backend 'dist\report_backend\report_backend.exe'

if (-not (Test-Path -LiteralPath (Join-Path $Frontend 'package.json'))) {
  throw "Project root not found (expected frontend\package.json). Resolved root: $Root"
}

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-WarnLine([string]$Text) {
  Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Require-Command([string[]]$Names, [string]$Hint) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
      return $cmd.Source
    }
  }
  throw "Missing command ($($Names -join ' / ')). $Hint"
}

function Invoke-Npm([string[]]$NpmArgs) {
  $npmCmd = Require-Command @('npm.cmd', 'npm') 'Install Node.js LTS from https://nodejs.org/'
  $prevRegistry = $env:NPM_CONFIG_REGISTRY
  $env:NPM_CONFIG_REGISTRY = $NpmRegistry
  try {
    & $npmCmd @NpmArgs
    if ($LASTEXITCODE -ne 0) {
      throw "npm failed: $($NpmArgs -join ' ') (exit $LASTEXITCODE)"
    }
  }
  finally {
    if ($null -eq $prevRegistry) {
      Remove-Item Env:NPM_CONFIG_REGISTRY -ErrorAction SilentlyContinue
    }
    else {
      $env:NPM_CONFIG_REGISTRY = $prevRegistry
    }
  }
}

function Get-NodeMajorVersion {
  $raw = (& node -p 'process.versions.node' 2>$null)
  if (-not $raw) { return 0 }
  return [int](($raw -split '\.')[0])
}

function Invoke-ViteBuild([string]$FrontendDir) {
  $viteJs = Join-Path $FrontendDir 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path -LiteralPath $viteJs)) {
    throw "Missing $viteJs — run npm ci in frontend first."
  }
  $prevNodeOpts = $env:NODE_OPTIONS
  # 830+ 模块 + 大 chunk；Windows 默认堆内存不足时 vite 会崩溃且只显示 Node.js 版本行
  $env:NODE_OPTIONS = '--max-old-space-size=8192'
  try {
    & node $viteJs build
    if ($LASTEXITCODE -ne 0) {
      throw "vite build failed (exit $LASTEXITCODE)"
    }
  }
  finally {
    if ($null -eq $prevNodeOpts) {
      Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    }
    else {
      $env:NODE_OPTIONS = $prevNodeOpts
    }
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$MigratePs1 = Join-Path $Frontend 'scripts\migrate-legacy-release.ps1'
if ((Test-Path -LiteralPath (Join-Path $Frontend 'release')) -or (Test-Path -LiteralPath (Join-Path $Frontend 'release-alt'))) {
  Write-Step 'Migrate legacy frontend\release* -> packaging\windows\output'
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $MigratePs1
}

Write-Step 'SD SMA Report Editor - Windows installer build'
$pkgJson = Get-Content -LiteralPath (Join-Path $Frontend 'package.json') -Raw | ConvertFrom-Json
Write-Host "Version:      $($pkgJson.version)"
Write-Host "Project root: $Root"
Write-Host "Output dir:   $OutputDir"

Require-Command @('node') 'Install Node.js LTS (20.x or 22.x).'
Require-Command @('py', 'python') 'Install Python 3.10+ with the Windows py launcher.'

$nodeVer = & node -p 'process.versions.node'
Write-Host "Node.js: $nodeVer"
$nodeMajor = Get-NodeMajorVersion
if ($nodeMajor -ge 24) {
  Write-WarnLine "Node.js $nodeVer is newer than tested (recommend 22.x LTS). If vite build crashes, install Node 22 from https://nodejs.org/"
}
elseif ($nodeMajor -lt 20) {
  throw "Node.js $nodeVer is too old. Install Node.js 20.x or 22.x LTS."
}

if ($Fresh) {
  Write-Step 'Clean packaging/windows/output'
  if (Test-Path -LiteralPath $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  }
}

if (-not $SkipFrontendInstall) {
  Write-Step 'Frontend dependencies (npm ci)'
  Push-Location $Frontend
  try {
    if (Test-Path -LiteralPath 'package-lock.json') {
      Invoke-Npm @('ci', '--no-audit', '--no-fund')
    }
    else {
      Invoke-Npm @('install', '--no-audit', '--no-fund')
    }
    Write-Ok 'npm dependencies ready'
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipBackendBuild) {
  Write-Step 'Backend executable (PyInstaller)'
  $buildBackend = Join-Path $Backend 'scripts\build-backend-exe.ps1'
  if (-not (Test-Path -LiteralPath $buildBackend)) {
    throw "Missing $buildBackend"
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $buildBackend
  if (-not (Test-Path -LiteralPath $BackendExe)) {
    throw "Backend build failed: $BackendExe"
  }
  Write-Ok "Backend: $BackendExe"
}
elseif (-not (Test-Path -LiteralPath $BackendExe)) {
  throw "SkipBackendBuild set but missing $BackendExe. Run without -SkipBackendBuild first."
}

Write-Step 'Vite production build'
Push-Location $Frontend
try {
  Invoke-ViteBuild $Frontend
  Write-Ok 'frontend/dist ready'
}
finally {
  Pop-Location
}

$iconPng = Join-Path $Frontend 'build\icon.png'
$iconIco = Join-Path $Frontend 'build\icon.ico'
if ((Test-Path -LiteralPath $iconPng) -and (-not (Test-Path -LiteralPath $iconIco))) {
  Write-Step 'Generate build/icon.ico from icon.png'
  Push-Location $Frontend
  try {
    cmd /c "npx --yes png-to-ico build\icon.png > build\icon.ico"
    if (-not (Test-Path -LiteralPath $iconIco)) {
      throw "Failed to generate $iconIco"
    }
    Write-Ok "Windows icon: $iconIco"
  }
  finally {
    Pop-Location
  }
}

Write-Step 'electron-builder (NSIS installer only)'
# 旧版 signAndEditExecutable 可能留下损坏的 winCodeSign 缓存，导致仍尝试解压并报符号链接错误
$winCodeSignCache = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
if (Test-Path -LiteralPath $winCodeSignCache) {
  Write-WarnLine "Removing stale winCodeSign cache: $winCodeSignCache"
  Remove-Item -LiteralPath $winCodeSignCache -Recurse -Force -ErrorAction SilentlyContinue
}
$env:ELECTRON_MIRROR = $ElectronMirror
$outConfig = $OutputDir
Push-Location $Frontend
try {
  $eb = Join-Path $Frontend 'node_modules\.bin\electron-builder.cmd'
  if (-not (Test-Path -LiteralPath $eb)) {
    & npx electron-builder '--win', 'nsis', ('--config.directories.output=' + $outConfig)
  }
  else {
    & $eb '--win', 'nsis', ('--config.directories.output=' + $outConfig)
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'electron-builder failed'
  }
}
finally {
  Pop-Location
  Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
}

$setup = Get-ChildItem -LiteralPath $OutputDir -Filter '*-Setup-*-x64.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Step 'Done'
if ($setup) {
  Write-Ok "Installer: $($setup.FullName)"
  Write-Host ''
  Write-Host 'Deliver this Setup.exe to end users (Windows 10/11 x64).' -ForegroundColor White
  Write-Host 'Install: double-click Setup, choose directory, complete wizard.' -ForegroundColor DarkGray
  Write-Host 'Uninstall: Settings > Apps > Installed apps > "SD SMA Report Editor" > Uninstall' -ForegroundColor DarkGray
  Write-Host 'Uninstall removes: %APPDATA%\sd-sma-report-editor\' -ForegroundColor DarkGray
}
else {
  Write-WarnLine "No *-Setup-*-x64.exe under $OutputDir. Check electron-builder log above."
  exit 1
}
