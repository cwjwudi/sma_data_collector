# Build SD SMA Report Editor Windows NSIS installer (Setup.exe).
# ASCII-only for Windows PowerShell 5.1 compatibility.
#
# Output: packaging/windows/output/Report Editor-Setup-{version}-x64.exe

[CmdletBinding()]
param(
  [string]$Version = '',
  [string]$Notes = '',
  [switch]$SkipFrontendInstall,
  [switch]$SkipBackendBuild,
  [switch]$SkipTests,
  [switch]$Fresh,
  [switch]$NoPause,
  [switch]$AllowVersionMismatch,
  [switch]$Help,
  [string]$NpmRegistry = 'https://registry.npmmirror.com',
  [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/'
)

if ($Help) {
  @'
Usage: .\build.ps1 [options]

  -Version <semver>     Bump package.json + latest.json before build
  -Notes <text>         Release notes (with -Version)
  -Fresh                Clear packaging\windows\output first
  -SkipFrontendInstall  Skip npm ci
  -SkipBackendBuild     Skip PyInstaller
  -SkipTests            Skip npm test (not recommended)
  -AllowVersionMismatch Warn only if package.json != latest.json
  -NoPause              No "press any key" on failure

Example (0.1.20):
  .\build.ps1 -Fresh
  .\build.ps1 -Version 0.1.20 -Notes "release notes" -Fresh
'@ | Write-Host
  exit 0
}

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

function Get-FrontendVersion {
  param([string]$PackageJsonPath)
  # Node reads UTF-8 reliably; PS 5.1 Get-Content default encoding breaks Chinese in package.json
  $ver = (& node -e "const fs=require('fs');process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).version)" $PackageJsonPath)
  if (-not $ver) { throw "Could not read version from $PackageJsonPath" }
  return $ver.Trim()
}

function Get-ManifestVersion {
  param([string]$ManifestPath)
  if (-not (Test-Path -LiteralPath $ManifestPath)) { return '' }
  $ver = (& node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(m.version||'')" $ManifestPath)
  if (-not $ver) { return '' }
  return $ver.Trim()
}

function Sync-LockfileVersion {
  param(
    [string]$PackageJsonPath,
    [string]$LockPath
  )
  $pkgVer = Get-FrontendVersion $PackageJsonPath
  $oneLiner =
    "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));" +
    "const lock=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));lock.version=pkg.version;" +
    "if(lock.packages&&lock.packages[''])lock.packages[''].version=pkg.version;" +
    "fs.writeFileSync(process.argv[2],JSON.stringify(lock,null,2)+'\n','utf8');"
  & node -e $oneLiner $PackageJsonPath $LockPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to sync package-lock.json version'
  }
  Write-Ok "package-lock.json version -> $pkgVer"
}

function Invoke-NpmCi {
  $nodeMajor = Get-NodeMajorVersion
  $npmCiArgs = @('ci', '--no-audit', '--no-fund')
  # package.json engines: node 20-23; npm ci on Node 24+ needs --ignore-engines
  if ($nodeMajor -ge 24) {
    Write-WarnLine 'Node.js 24+: npm ci adds --ignore-engines (prefer Node 22 LTS for packaging)'
    $npmCiArgs += '--ignore-engines'
  }
  Invoke-Npm $npmCiArgs
  # npm ci does not rewrite package.json; sync lockfile root version for consistency
  $lockPath = Join-Path $Frontend 'package-lock.json'
  $pkgJsonPath = Join-Path $Frontend 'package.json'
  if (Test-Path -LiteralPath $lockPath) {
    $lockVer = (& node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write((l.packages&&l.packages['']&&l.packages[''].version)||l.version||'')" $lockPath)
    $pkgVer = Get-FrontendVersion $pkgJsonPath
    if ($lockVer -and $pkgVer -and $lockVer -ne $pkgVer) {
      Write-WarnLine "package-lock.json ($lockVer) != package.json ($pkgVer); syncing lockfile..."
      Sync-LockfileVersion $pkgJsonPath $lockPath
    }
  }
}

function Invoke-NpmTest {
  Write-Step 'Unit tests (vitest)'
  Push-Location $Frontend
  try {
    Invoke-Npm @('run', 'test', '--', '--run')
    Write-Ok 'npm test passed'
  }
  finally {
    Pop-Location
  }
}

function Get-StaleSetupInstallers {
  param(
    [string]$Dir,
    [string]$ExpectedName
  )
  if (-not (Test-Path -LiteralPath $Dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $Dir -Filter 'Report Editor-Setup-*-x64.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne $ExpectedName })
}

function Invoke-ViteBuild([string]$FrontendDir) {
  $viteJs = Join-Path $FrontendDir 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path -LiteralPath $viteJs)) {
    throw "Missing $viteJs - run npm ci in frontend first."
  }
  $prevNodeOpts = $env:NODE_OPTIONS
  # Large Vite graph; raise heap on Windows to avoid silent OOM
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

if ($Version) {
  Write-Step "Bump version -> $Version"
  $bumpScript = Join-Path $Root 'packaging\scripts\bump-version.mjs'
  $bumpArgs = @($bumpScript, $Version)
  if ($Notes) {
    $bumpArgs += '--notes', $Notes
  }
  & node @bumpArgs
  if ($LASTEXITCODE -ne 0) {
    throw "bump-version.mjs failed (exit $LASTEXITCODE)"
  }
  Write-Ok 'version bumped'
}

$MigratePs1 = Join-Path $Frontend 'scripts\migrate-legacy-release.ps1'
if ((Test-Path -LiteralPath (Join-Path $Frontend 'release')) -or (Test-Path -LiteralPath (Join-Path $Frontend 'release-alt'))) {
  Write-Step 'Migrate legacy frontend\release* -> packaging\windows\output'
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $MigratePs1
}

Write-Step 'SD SMA Report Editor - Windows installer build'
$PkgJsonPath = Join-Path $Frontend 'package.json'
$AppVersion = Get-FrontendVersion $PkgJsonPath
$ManifestPath = Join-Path $Root 'packaging\updates\latest.json'
$ManifestVersion = Get-ManifestVersion $ManifestPath
$ExpectedSetup = "Report Editor-Setup-$AppVersion-x64.exe"
Write-Host "Version:      $AppVersion"
Write-Host "Expected:     $ExpectedSetup"
if ($ManifestVersion) {
  Write-Host "Manifest:     $ManifestVersion (packaging/updates/latest.json)"
}
if ($ManifestVersion -and $ManifestVersion -ne $AppVersion) {
  $msg = "package.json ($AppVersion) != packaging/updates/latest.json ($ManifestVersion)."
  if ($AllowVersionMismatch) {
    Write-WarnLine "$msg Continuing because -AllowVersionMismatch."
  }
  else {
    throw @(
      "ERROR: $msg",
      "Run: node packaging/scripts/bump-version.mjs $AppVersion",
      "Or:  .\build.ps1 -Version $ManifestVersion",
      "Or:  .\build.ps1 -Version $AppVersion -Notes `"...`" -Fresh"
    ) -join "`n"
  }
}
Write-Host "Project root: $Root"
Write-Host "Output dir:   $OutputDir"
if ($NoPause) {
  $env:REPORT_EDITOR_BUILD_NO_PAUSE = '1'
}

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
else {
  $stale = Get-StaleSetupInstallers -Dir $OutputDir -ExpectedName $ExpectedSetup
  if ($stale.Count -gt 0) {
    $names = ($stale | ForEach-Object { $_.Name }) -join ', '
    Write-WarnLine "output contains older installers: $names"
    Write-WarnLine "Use -Fresh to avoid picking wrong version, or delete stale exe manually."
  }
}

if (-not $SkipFrontendInstall) {
  Write-Step 'Frontend dependencies (npm ci)'
  Push-Location $Frontend
  try {
    if (Test-Path -LiteralPath 'package-lock.json') {
      Invoke-NpmCi
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

$iconPng = Join-Path $Frontend 'build\icon.png'
$iconIco = Join-Path $Frontend 'build\icon.ico'
if (-not (Test-Path -LiteralPath $iconPng)) {
  throw "Missing icon source: $iconPng (run git pull; or frontend/scripts/make-app-icon.sh)"
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

if (-not $SkipTests) {
  Invoke-NpmTest
}
else {
  Write-WarnLine 'Skipping npm test (-SkipTests).'
}

# Re-read version after npm ci (lockfile sync does not change package.json)
$AppVersion = Get-FrontendVersion $PkgJsonPath
$ExpectedSetup = "Report Editor-Setup-$AppVersion-x64.exe"

Write-Step 'Vite production build'
Push-Location $Frontend
try {
  Invoke-ViteBuild $Frontend
  Write-Ok 'frontend/dist ready'
}
finally {
  Pop-Location
}

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
# Stale winCodeSign cache can break icon embedding on some Windows setups
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
    throw "electron-builder failed (exit $LASTEXITCODE). See packaging/windows/README.md (winCodeSign, output lock, mirror)."
  }
}
finally {
  Pop-Location
  Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
}

$expectedSetupName = "Report Editor-Setup-$AppVersion-x64.exe"
$expectedSetupPath = Join-Path $OutputDir $expectedSetupName
$setup = $null
if (Test-Path -LiteralPath $expectedSetupPath) {
  $setup = Get-Item -LiteralPath $expectedSetupPath
}
else {
  $candidates = Get-ChildItem -LiteralPath $OutputDir -Filter '*-Setup-*-x64.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if ($candidates) {
    $wrong = $candidates | Where-Object { $_.Name -ne $expectedSetupName } | Select-Object -First 1
    if ($wrong) {
      throw @(
        "ERROR: Expected $expectedSetupName but newest installer is $($wrong.Name).",
        "package.json version is $AppVersion — run bump-version or use -Fresh."
      ) -join "`n"
    }
    $setup = $candidates | Select-Object -First 1
  }
}

Write-Step 'Done'
if ($setup) {
  if ($setup.Name -ne $expectedSetupName) {
    throw "Installer name mismatch: $($setup.Name) (expected $expectedSetupName)"
  }
  $sizeMb = [math]::Round($setup.Length / 1MB, 1)
  Write-Ok "Installer: $($setup.FullName) ($sizeMb MB, $($setup.Name))"
  Write-Host ''
  Write-Host 'Deliver this Setup.exe to end users (Windows 10/11 x64).' -ForegroundColor White
  Write-Host 'Install: double-click Setup, choose directory, complete wizard.' -ForegroundColor DarkGray
  Write-Host 'Uninstall: Settings - Apps - Installed apps - SD SMA Report Editor' -ForegroundColor DarkGray
  Write-Host 'Uninstall removes user data under %APPDATA%\sd-sma-report-editor\' -ForegroundColor DarkGray

  Write-Step 'Update manifest + sync Portal (if mounted)'
  $publishScript = Join-Path $Root 'packaging\scripts\publish-portal-release.mjs'
  # --only win: 保留 latest.json 中已有 darwin-arm64（分平台发版）
  & node $publishScript '--copy-artifacts' '--only' 'win'
  if ($LASTEXITCODE -ne 0) {
    Write-WarnLine 'publish-portal-release failed; run manually after build.'
  }
  else {
    Write-Ok 'latest.json synced (win32-x64; mac 条目已保留若同版本已存在)'
  }
}
else {
  Write-WarnLine "No *-Setup-*-x64.exe under $OutputDir. Check electron-builder log above."
  exit 1
}
