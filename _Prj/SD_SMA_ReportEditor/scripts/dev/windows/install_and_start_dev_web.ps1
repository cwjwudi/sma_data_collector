# One-click dependency install + web dev startup for SD_SMA_ReportEditor.
# This script is intentionally ASCII-only for Windows PowerShell 5.1 compatibility.

[CmdletBinding()]
param(
  [switch]$NoStart,
  [switch]$ForceFrontendInstall,
  [switch]$ForceRptpInstall,
  [switch]$ForceBackendInstall,
  [switch]$SkipRptp,
  [switch]$SkipStop,
  [string]$NpmRegistry = 'https://registry.npmmirror.com',
  [string]$ElectronMirror = 'https://npmmirror.com/mirrors/electron/',
  [int]$NpmFetchRetries = 5,
  [int]$NpmFetchRetryMaxTimeout = 120000
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir '..\..\..')).Path
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Rptp = Join-Path $Root 'rptp'
$BackendReq = Join-Path $Backend 'requirements.txt'
$FrontendPkg = Join-Path $Frontend 'package.json'
$FrontendLock = Join-Path $Frontend 'package-lock.json'
$RptpPkg = Join-Path $Rptp 'package.json'
$RptpLock = Join-Path $Rptp 'package-lock.json'
$VenvDir = Join-Path $Backend 'venv'
$VenvPy = Join-Path $VenvDir 'Scripts\python.exe'
$StartBat = Join-Path $ScriptDir 'start_dev_web.bat'
$StopPs1 = Join-Path $ScriptDir 'stop_dev_web.ps1'

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Info([string]$Text) {
  Write-Host "[INFO] $Text" -ForegroundColor DarkGray
}

function Write-Ok([string]$Text) {
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-WarnLine([string]$Text) {
  Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Require-Path([string]$Path, [string]$Hint) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing $Path. $Hint"
  }
}

function Get-CommandPath([string[]]$Names) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
      return $cmd.Source
    }
  }
  return $null
}

function Invoke-Checked([string]$Exe, [string[]]$ArgList, [string]$Cwd) {
  Write-Info ("Running: {0} {1}" -f $Exe, ($ArgList -join ' '))
  Push-Location $Cwd
  try {
    & $Exe @ArgList
    $code = $LASTEXITCODE
    if ($null -ne $code -and $code -ne 0) {
      throw "Command failed with exit code ${code}: $Exe $($ArgList -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Configure-NpmMirror {
  Write-Step 'Npm mirror'

  if ($NpmRegistry) {
    $env:npm_config_registry = $NpmRegistry
    Write-Ok "npm registry = $NpmRegistry"
  }

  if ($ElectronMirror) {
    $env:ELECTRON_MIRROR = $ElectronMirror
    $env:npm_config_electron_mirror = $ElectronMirror
    Write-Ok "Electron mirror = $ElectronMirror"
  }

  $env:npm_config_fetch_retries = [string]$NpmFetchRetries
  $env:npm_config_fetch_retry_maxtimeout = [string]$NpmFetchRetryMaxTimeout
  $env:npm_config_audit = 'false'

  Write-Info "npm fetch retries = $NpmFetchRetries"
  Write-Info "npm fetch retry max timeout = $NpmFetchRetryMaxTimeout ms"
  Write-Info 'npm audit is disabled during install to avoid extra registry requests.'
}

function Resolve-PythonLauncher {
  $py = Get-CommandPath @('py.exe', 'py')
  if ($py) {
    return @{ Exe = $py; Prefix = @('-3') }
  }

  $python = Get-CommandPath @('python.exe', 'python')
  if ($python) {
    return @{ Exe = $python; Prefix = @() }
  }

  throw 'Python was not found. Install Python 3.9+ (recommended 3.10+) and add it to PATH.'
}

function Test-PythonVersion($Launcher) {
$code = @'
import sys
print(chr(46).join(map(str, sys.version_info[:3])))
raise SystemExit(0 if sys.version_info >= (3, 9) else 1)
'@
  $cmdArgs = @($Launcher.Prefix) + @('-c', $code)
  $version = & $Launcher.Exe @cmdArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Python 3.9+ is required. Detected: $version"
  }
  Write-Ok "Python $version"
}

function Ensure-BackendVenv($Launcher) {
  Write-Step 'Backend Python environment'

  if (-not (Test-Path -LiteralPath $VenvPy)) {
    Write-Info 'Creating backend\venv ...'
    $cmdArgs = @($Launcher.Prefix) + @('-m', 'venv', $VenvDir)
    Invoke-Checked $Launcher.Exe $cmdArgs $Backend
  } else {
    Write-Ok "Found $VenvPy"
  }

  if (-not (Test-Path -LiteralPath $VenvPy)) {
    throw "venv was not created correctly: $VenvPy"
  }

  if ($env:PIP_INDEX_URL) {
    Write-Info "Using PIP_INDEX_URL=$env:PIP_INDEX_URL"
  }

  if ($ForceBackendInstall) {
    Write-Info 'ForceBackendInstall is set; reinstalling backend requirements.'
  }

  Invoke-Checked $VenvPy @('-m', 'pip', 'install', '--upgrade', 'pip') $Backend
  Invoke-Checked $VenvPy @('-m', 'pip', 'install', '-r', $BackendReq) $Backend
  Write-Ok 'Backend requirements are installed.'
}

function Ensure-FrontendDeps([string]$NpmCmd) {
  Write-Step 'Frontend npm dependencies'

  $nodeModules = Join-Path $Frontend 'node_modules'
  $viteCmd = Join-Path $Frontend 'node_modules\.bin\vite.cmd'
  $vitePkg = Join-Path $Frontend 'node_modules\vite\package.json'
  $needInstall = $ForceFrontendInstall -or
    (-not (Test-Path -LiteralPath $nodeModules)) -or
    (-not (Test-Path -LiteralPath $viteCmd)) -or
    (-not (Test-Path -LiteralPath $vitePkg))

  if (-not $needInstall) {
    Write-Ok 'frontend\node_modules exists; skipping npm install.'
    Write-Info 'Use -ForceFrontendInstall to refresh frontend dependencies.'
    return
  }

  if (Test-Path -LiteralPath $nodeModules) {
    Write-WarnLine 'frontend\node_modules is missing required files; reinstalling frontend dependencies.'
  }

  if (Test-Path -LiteralPath $FrontendLock) {
    Invoke-Checked $NpmCmd @('ci') $Frontend
  } else {
    Invoke-Checked $NpmCmd @('install') $Frontend
  }

  Write-Ok 'Frontend dependencies are installed.'
}

function Ensure-RptpDeps([string]$NpmCmd) {
  if ($SkipRptp) {
    Write-Info 'SkipRptp is set; not installing rptp dependencies.'
    return
  }
  if (-not (Test-Path -LiteralPath $RptpPkg)) {
    Write-Info 'rptp package.json not found; skipping rptp dependencies.'
    return
  }

  Write-Step 'Rptp npm dependencies'

  $nodeModules = Join-Path $Rptp 'node_modules'
  $viteCmd = Join-Path $Rptp 'node_modules\.bin\vite.cmd'
  $vitePkg = Join-Path $Rptp 'node_modules\vite\package.json'
  $needInstall = $ForceRptpInstall -or
    (-not (Test-Path -LiteralPath $nodeModules)) -or
    (-not (Test-Path -LiteralPath $viteCmd)) -or
    (-not (Test-Path -LiteralPath $vitePkg))

  if (-not $needInstall) {
    Write-Ok 'rptp\node_modules exists; skipping npm install.'
    Write-Info 'Use -ForceRptpInstall to refresh rptp dependencies.'
    return
  }

  if (Test-Path -LiteralPath $nodeModules) {
    Write-WarnLine 'rptp\node_modules is missing required files; reinstalling rptp dependencies.'
  }

  if (Test-Path -LiteralPath $RptpLock) {
    Invoke-Checked $NpmCmd @('ci') $Rptp
  } else {
    Invoke-Checked $NpmCmd @('install') $Rptp
  }

  Write-Ok 'Rptp dependencies are installed.'
}

function Show-ToolVersions([string]$NpmCmd, $Launcher) {
  Write-Step 'Tool check'
  Test-PythonVersion $Launcher

  $node = Get-CommandPath @('node.exe', 'node')
  if (-not $node) {
    throw 'Node.js was not found. Install Node.js LTS and add it to PATH.'
  }
  $nodeVer = & $node --version
  Write-Ok "Node $nodeVer"

  $npmVer = & $NpmCmd --version
  if ($LASTEXITCODE -ne 0) {
    throw 'npm exists but could not run.'
  }
  Write-Ok "npm $npmVer"

  $docker = Get-CommandPath @('docker.exe', 'docker')
  if ($docker) {
    Write-Info 'Docker found. Optional docker-compose demo services are not started by this script.'
  } else {
    Write-Info 'Docker not found. Skipping optional MariaDB / OPC UA demo services.'
  }
}

function Stop-ExistingDevPorts {
  if ($SkipStop) {
    Write-Info 'SkipStop is set; not stopping existing dev ports.'
    return
  }
  if (Test-Path -LiteralPath $StopPs1) {
    Write-Step 'Release dev ports'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $StopPs1
    if ($LASTEXITCODE -ne 0) {
      Write-WarnLine 'stop_dev_web.ps1 reported a non-zero exit. Continuing; start may fail if ports are busy.'
    }
  }
}

Require-Path (Join-Path $Backend 'main.py') 'SD_SMA_ReportEditor backend/main.py not found (wrong repo layout?).'
Require-Path $BackendReq 'Backend requirements are required.'
Require-Path $FrontendPkg 'Frontend package.json is required.'

$launcher = Resolve-PythonLauncher
$npmCmd = Get-CommandPath @('npm.cmd', 'npm.exe', 'npm')
if (-not $npmCmd) {
  throw 'npm was not found. Install Node.js LTS and add it to PATH.'
}

Write-Host 'SD_SMA_ReportEditor - one-click install and start' -ForegroundColor Cyan
Write-Host "Repo: $Root" -ForegroundColor DarkGray

Configure-NpmMirror
Show-ToolVersions $npmCmd $launcher
Stop-ExistingDevPorts
Ensure-BackendVenv $launcher
Ensure-FrontendDeps $npmCmd
Ensure-RptpDeps $npmCmd

if ($NoStart) {
  Write-Step 'Done'
  Write-Ok 'Dependencies are installed. Startup was skipped because -NoStart was set.'
  exit 0
}

Require-Path $StartBat 'start_dev_web.bat is required for web startup.'

Write-Step 'Start web dev services'
Write-Info 'Starting backend and frontend in separate PowerShell windows...'
Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', "`"$StartBat`"") -WorkingDirectory $Root -WindowStyle Hidden
Write-Ok 'Startup script launched. Browser will open after Vite is ready.'
