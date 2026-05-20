# Build SD SMA Report Editor Windows NSIS installer (Setup.exe).
# ASCII-only for Windows PowerShell 5.1 compatibility.
#
# Output: frontend/release-installer/SD SMA Report Editor-Setup-<version>-x64.exe
# End users: run Setup -> install -> uninstall via Settings or Start Menu.

[CmdletBinding()]
param(
  [switch]$SkipFrontendInstall,
  [switch]$SkipBackendBuild,
  [switch]$Fresh,
  [string]$OutputDir = 'release-installer',
  [string]$NpmRegistry = 'https://registry.npmmirror.com',
  [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root 'frontend'
$Backend = Join-Path $Root 'backend'
$BackendExe = Join-Path $Backend 'dist\report_backend\report_backend.exe'

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
      throw "npm failed: $($NpmArgs -join ' ')"
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

Write-Step 'SD SMA Report Editor - Windows installer build'
Write-Host "Project root: $Root"

Require-Command @('node') 'Install Node.js LTS (20.x or 22.x).'
Require-Command @('py', 'python') 'Install Python 3.10+ with the Windows py launcher.'

if ($Fresh) {
  Write-Step 'Clean release-installer output'
  $cleanPs1 = Join-Path $Frontend 'scripts\clean-release.ps1'
  if (Test-Path -LiteralPath $cleanPs1) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $cleanPs1 $OutputDir
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
  Invoke-Npm @('run', 'build')
  Write-Ok 'frontend/dist ready'
}
finally {
  Pop-Location
}

Write-Step 'electron-builder (NSIS installer only)'
$env:ELECTRON_MIRROR = $ElectronMirror
Push-Location $Frontend
try {
  $eb = Join-Path $Frontend 'node_modules\.bin\electron-builder.cmd'
  if (-not (Test-Path -LiteralPath $eb)) {
    $eb = 'npx'
    $ebArgs = @(
      'electron-builder',
      '--win', 'nsis',
      '--config.directories.output=' + $OutputDir
    )
    & $eb @ebArgs
  }
  else {
    & $eb '--win', 'nsis', ('--config.directories.output=' + $OutputDir)
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'electron-builder failed'
  }
}
finally {
  Pop-Location
  Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
}

$outRoot = Join-Path $Frontend $OutputDir
$setup = Get-ChildItem -LiteralPath $outRoot -Filter '*-Setup-*-x64.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Step 'Done'
if ($setup) {
  Write-Ok "Installer: $($setup.FullName)"
  Write-Host ''
  Write-Host 'Deliver this Setup.exe to end users (Windows 10/11 x64).' -ForegroundColor White
  Write-Host 'Install: double-click Setup, choose directory, complete wizard.' -ForegroundColor DarkGray
  Write-Host 'Uninstall: Settings > Apps > Installed apps > "SD SMA Report Editor" > Uninstall' -ForegroundColor DarkGray
  Write-Host '          or Start Menu > B&R Team > Uninstall shortcut.' -ForegroundColor DarkGray
  Write-Host 'Data dir (kept after uninstall): %APPDATA%\sd-sma-report-editor\backend-data\' -ForegroundColor DarkGray
}
else {
  Write-WarnLine "No *-Setup-*-x64.exe under $outRoot. Check electron-builder log above."
  exit 1
}
