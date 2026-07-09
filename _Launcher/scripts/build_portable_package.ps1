param(
    [string]$OutputDir = "",
    [string]$Python = "",
    [string]$PipIndexUrl = "https://pypi.tuna.tsinghua.edu.cn/simple",
    [string]$PipTrustedHost = "pypi.tuna.tsinghua.edu.cn",
    [string]$HttpProxy = "",
    [switch]$BuildWheelhouse,
    [switch]$SkipVenv,
    [switch]$Zip
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherDir = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $LauncherDir

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $RepoRoot "_Build\SD_SMA_Runtime_Package"
}

$PackageRoot = (New-Item -ItemType Directory -Force -Path $OutputDir).FullName
$PackageLauncher = Join-Path $PackageRoot "_Launcher"
$PackageProjects = Join-Path $PackageRoot "_Prj"
$Requirements = Join-Path $LauncherDir "requirements-unified.txt"
$LauncherConfig = Join-Path $LauncherDir "launcher_config.json"

function Clear-ProxyEnv {
    foreach ($name in @(
            "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
            "http_proxy", "https_proxy", "all_proxy", "no_proxy"
        )) {
        Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
}

function Set-OptionalProxyEnv {
    param([string]$ProxyUrl)

    Clear-ProxyEnv
    if ([string]::IsNullOrWhiteSpace($ProxyUrl)) {
        Write-Host "[proxy] disabled (domestic PyPI mirror does not need proxy by default)"
        return
    }

    $env:HTTP_PROXY = $ProxyUrl
    $env:HTTPS_PROXY = $ProxyUrl
    $env:NO_PROXY = "localhost,127.0.0.1,::1,pypi.tuna.tsinghua.edu.cn,mirrors.aliyun.com,mirrors.cloud.tencent.com"
    $env:http_proxy = $env:HTTP_PROXY
    $env:https_proxy = $env:HTTPS_PROXY
    $env:no_proxy = $env:NO_PROXY
    Write-Host "[proxy] enabled: $ProxyUrl"
}

function Get-PythonVersionInfo {
    param([Parameter(Mandatory = $true)][string]$PythonExe)

    $raw = & $PythonExe -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}|{sys.executable}')"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
        throw "Failed to query Python version: $PythonExe"
    }
    $parts = $raw.Trim() -split "\|", 2
    return [pscustomobject]@{
        Version = $parts[0]
        Executable = if ($parts.Count -gt 1) { $parts[1] } else { $PythonExe }
        MajorMinor = [version](($parts[0] -split "\.")[0..1] -join ".")
    }
}

function Test-PythonCandidate {
    param([string]$Candidate)

    if ([string]::IsNullOrWhiteSpace($Candidate)) {
        return $false
    }
    if (Test-Path -LiteralPath $Candidate) {
        return $true
    }
    try {
        $null = Get-Command $Candidate -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Resolve-BuildPython {
    param([string]$RequestedPython)

    $candidates = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
        $candidates.Add($RequestedPython)
    }

    $repoVenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $repoVenvPython) {
        try {
            $basePrefix = & $repoVenvPython -c "import sys; print(sys.base_prefix)"
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($basePrefix)) {
                $baseExe = Join-Path $basePrefix.Trim() "python.exe"
                if (Test-Path -LiteralPath $baseExe) {
                    $candidates.Add($baseExe)
                }
            }
        }
        catch {
            # ignore and continue with other candidates
        }
        $candidates.Add($repoVenvPython)
    }

    $codexRuntimePython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
    if (Test-Path -LiteralPath $codexRuntimePython) {
        $candidates.Add($codexRuntimePython)
    }

    foreach ($launcher in @("py")) {
        try {
            $pyList = & $launcher -0p 2>$null
            if ($LASTEXITCODE -eq 0 -and $pyList) {
                foreach ($line in ($pyList -split "`r?`n")) {
                    if ($line -match "(\d+\.\d+).*\s+(\S:\\.*python\.exe)\s*$") {
                        $candidates.Add($Matches[2])
                    }
                }
            }
        }
        catch {
            # py launcher may be unavailable
        }
    }

    $candidates.Add("python")

    $seen = @{}
    $usable = @()
    foreach ($candidate in $candidates) {
        if (-not (Test-PythonCandidate $candidate)) {
            continue
        }
        try {
            $info = Get-PythonVersionInfo -PythonExe $candidate
        }
        catch {
            continue
        }
        $key = $info.Executable.ToLowerInvariant()
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true
        $usable += $info
    }

    if (-not $usable) {
        throw "No usable Python interpreter found. Install Python 3.10-3.12 or pass -Python."
    }

    function Get-PythonPreferenceScore {
        param($Info)
        $path = [string]$Info.Executable
        $score = 0
        if ($Info.MajorMinor.Major -eq 3 -and $Info.MajorMinor.Minor -ge 10 -and $Info.MajorMinor.Minor -le 12) {
            $score += 100
        }
        # Prefer real installs / runtime bases over nested virtualenvs.
        if ($path -match '(?i)[\\/]\.venv[\\/]|[\\/]venv[\\/]') {
            $score -= 50
        }
        if ($path -match '(?i)codex-runtimes|Program Files|Local\\Programs\\Python') {
            $score += 10
        }
        $score += $Info.MajorMinor.Minor
        return $score
    }

    $ranked = $usable | Sort-Object { - (Get-PythonPreferenceScore $_) }, { $_.Executable }
    $best = $ranked | Select-Object -First 1
    if ($best.MajorMinor.Major -ne 3 -or $best.MajorMinor.Minor -lt 10 -or $best.MajorMinor.Minor -gt 12) {
        Write-Host "[warn] No Python 3.10-3.12 found; falling back to $($best.Executable) ($($best.Version))"
    }
    return $best
}

function Invoke-Pip {
    param(
        [Parameter(Mandatory = $true)][string]$VenvPython,
        [Parameter(Mandatory = $true)][string[]]$PipArgs
    )

    $indexArgs = @(
        "-i", $PipIndexUrl,
        "--trusted-host", $PipTrustedHost
    )
    Write-Host "[pip] $($PipArgs -join ' ')  (index=$PipIndexUrl)"
    & $VenvPython -m pip @PipArgs @indexArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pip failed: $($PipArgs -join ' ')"
    }
}

function Copy-DirectoryFiltered {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$SkipDirectoryNames = @(
            ".git", ".pytest_cache", ".mypy_cache", "__pycache__", "venv", ".venv",
            "logs", "dist", "node_modules"
        ),
        [string[]]$SkipFileExtensions = @(".pyc", ".pyo", ".log"),
        [string[]]$SkipRelativePrefixes = @()
    )

    $sourceRoot = (Resolve-Path $Source).Path
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force | ForEach-Object {
        $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\", "/")
        if ([string]::IsNullOrWhiteSpace($relative)) {
            return
        }

        $parts = $relative -split "[\\/]"
        foreach ($part in $parts) {
            if ($SkipDirectoryNames -contains $part) {
                return
            }
        }

        foreach ($prefix in $SkipRelativePrefixes) {
            if (-not [string]::IsNullOrWhiteSpace($prefix)) {
                $normalizedRelative = $relative.Replace("/", "\")
                $normalizedPrefix = $prefix.Replace("/", "\")
                if ($normalizedRelative.StartsWith($normalizedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    return
                }
            }
        }

        $target = Join-Path $Destination $relative
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
            return
        }

        if ($SkipFileExtensions -contains $_.Extension.ToLowerInvariant()) {
            return
        }

        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

function Get-PythonBasePrefix {
    param([Parameter(Mandatory = $true)][string]$PythonExe)

    $raw = & $PythonExe -c "import sys; print(sys.base_prefix)"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
        throw "Failed to resolve sys.base_prefix for: $PythonExe"
    }
    $base = $raw.Trim()
    $baseExe = Join-Path $base "python.exe"
    if (-not (Test-Path -LiteralPath $baseExe)) {
        throw "Python base prefix is missing python.exe: $base"
    }
    return (Resolve-Path -LiteralPath $base).Path
}

function Copy-BundledPythonRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePythonHome,
        [Parameter(Mandatory = $true)][string]$DestinationPythonHome
    )

    if (Test-Path -LiteralPath $DestinationPythonHome) {
        Remove-Item -LiteralPath $DestinationPythonHome -Recurse -Force
    }

    Write-Host "[python-runtime] bundling base Python into package: $DestinationPythonHome"
    # Keep stdlib (including Lib/venv) + DLLs.
    # Drop the base interpreter's own site-packages (can be hundreds of MB) and stdlib tests.
    Copy-DirectoryFiltered `
        -Source $SourcePythonHome `
        -Destination $DestinationPythonHome `
        -SkipDirectoryNames @(
            ".git", ".pytest_cache", ".mypy_cache", "__pycache__", ".venv",
            "logs", "dist", "node_modules", "site-packages", "idle_test"
        ) `
        -SkipRelativePrefixes @(
            "Lib\test\",
            "Lib/test/",
            "Lib\tests\",
            "Lib/tests/"
        )

    $bundledExe = Join-Path $DestinationPythonHome "python.exe"
    $bundledDll = Get-ChildItem -LiteralPath $DestinationPythonHome -Filter "python3*.dll" -File -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $bundledExe)) {
        throw "Bundled Python runtime is missing python.exe"
    }
    if (-not $bundledDll) {
        throw "Bundled Python runtime is missing python3*.dll (package would not be portable)."
    }
    return $bundledExe
}

function Set-VenvHome {
    param(
        [Parameter(Mandatory = $true)][string]$VenvDir,
        [Parameter(Mandatory = $true)][string]$PythonHome
    )

    $cfgPath = Join-Path $VenvDir "pyvenv.cfg"
    if (-not (Test-Path -LiteralPath $cfgPath)) {
        throw "pyvenv.cfg not found: $cfgPath"
    }

    $lines = Get-Content -LiteralPath $cfgPath
    $rewritten = foreach ($line in $lines) {
        if ($line -match '^\s*home\s*=') {
            "home = $PythonHome"
        }
        else {
            $line
        }
    }
    Set-Content -LiteralPath $cfgPath -Value $rewritten -Encoding ASCII
}

function Get-ServiceProjectNames {
    if (-not (Test-Path -LiteralPath $LauncherConfig)) {
        throw "launcher_config.json not found: $LauncherConfig"
    }

    $config = Get-Content -LiteralPath $LauncherConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.services) {
        throw "launcher_config.json has no services array."
    }

    $names = New-Object System.Collections.Generic.List[string]
    foreach ($service in $config.services) {
        $cwd = [string]$service.cwd
        if ([string]::IsNullOrWhiteSpace($cwd)) {
            continue
        }
        $normalized = $cwd.Replace("/", "\").Trim("\")
        $parts = $normalized -split "\\"
        if ($parts.Count -lt 2 -or $parts[0] -ne "_Prj") {
            throw "Service '$($service.name)' cwd must be under _Prj/: $cwd"
        }
        $projectName = $parts[1]
        if (-not $names.Contains($projectName)) {
            $names.Add($projectName)
        }
    }

    if ($names.Count -eq 0) {
        throw "No project directories resolved from launcher_config.json services."
    }
    return $names
}

Set-OptionalProxyEnv -ProxyUrl $HttpProxy

$pythonInfo = Resolve-BuildPython -RequestedPython $Python
$PythonExe = $pythonInfo.Executable
Write-Host "[python] using: $PythonExe ($($pythonInfo.Version))"
if ($pythonInfo.MajorMinor.Major -ne 3 -or $pythonInfo.MajorMinor.Minor -lt 10 -or $pythonInfo.MajorMinor.Minor -gt 12) {
    Write-Host "[warn] Recommended Python is 3.10-3.12 for field packages."
}

Write-Host "[package] output: $PackageRoot"
Write-Host "[pip] forced domestic index: $PipIndexUrl"

if (Test-Path $PackageLauncher) {
    Remove-Item -LiteralPath $PackageLauncher -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageLauncher | Out-Null
Copy-Item -LiteralPath (Join-Path $LauncherDir "sd_sma_launcher.py") -Destination $PackageLauncher -Force
Copy-Item -LiteralPath (Join-Path $LauncherDir "launcher_config.json") -Destination $PackageLauncher -Force
Copy-Item -LiteralPath (Join-Path $LauncherDir "requirements-unified.txt") -Destination $PackageLauncher -Force
Copy-Item -LiteralPath (Join-Path $LauncherDir "start.bat") -Destination $PackageLauncher -Force
Copy-Item -LiteralPath (Join-Path $LauncherDir "stop.bat") -Destination $PackageLauncher -Force

if (Test-Path $PackageProjects) {
    Remove-Item -LiteralPath $PackageProjects -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageProjects | Out-Null

$projectNames = Get-ServiceProjectNames
foreach ($projectName in $projectNames) {
    $source = Join-Path $RepoRoot "_Prj\$projectName"
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Project directory not found for launcher service: $source"
    }
    Write-Host "[copy] _Prj/$projectName"
    Copy-DirectoryFiltered `
        -Source $source `
        -Destination (Join-Path $PackageProjects $projectName)
}

$RootStart = Join-Path $PackageRoot "start.bat"
@"
@echo off
setlocal
cd /d "%~dp0_Launcher"
call start.bat %*
endlocal
"@ | Set-Content -LiteralPath $RootStart -Encoding ASCII

if (-not $SkipVenv) {
    $SourcePythonHome = Get-PythonBasePrefix -PythonExe $PythonExe
    $BundledPythonHome = Join-Path $PackageRoot "_Python"
    $BundledPythonExe = Copy-BundledPythonRuntime `
        -SourcePythonHome $SourcePythonHome `
        -DestinationPythonHome $BundledPythonHome

    $VenvDir = Join-Path $PackageRoot ".venv"
    if (Test-Path $VenvDir) {
        Remove-Item -LiteralPath $VenvDir -Recurse -Force
    }

    Write-Host "[venv] creating with --copies from bundled runtime: $VenvDir"
    & $BundledPythonExe -m venv --copies $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }
    Set-VenvHome -VenvDir $VenvDir -PythonHome $BundledPythonHome

    $VenvPython = Join-Path $VenvDir "Scripts\python.exe"
    Invoke-Pip -VenvPython $VenvPython -PipArgs @("install", "--upgrade", "pip")
    Invoke-Pip -VenvPython $VenvPython -PipArgs @("install", "-r", $Requirements)

    Write-Host "[venv] dependency check"
    & $VenvPython -m pip check
    if ($LASTEXITCODE -ne 0) {
        throw "pip check failed."
    }

    Write-Host "[venv] import check"
    & $VenvPython -c @"
import importlib.util
mods = ['fastapi', 'uvicorn', 'pydantic', 'sqlalchemy', 'pymysql', 'multipart', 'opcua', 'asyncua']
missing = [m for m in mods if importlib.util.find_spec(m) is None]
if missing:
    raise SystemExit('missing imports: ' + ', '.join(missing))
print('imports ok:', ', '.join(mods))
"@
    if ($LASTEXITCODE -ne 0) {
        throw "Import check failed."
    }

    Write-Host "[venv] portability check"
    & $VenvPython -c @"
from pathlib import Path
import sys
cfg = Path(sys.prefix) / 'pyvenv.cfg'
text = cfg.read_text(encoding='utf-8', errors='ignore')
home_line = next((line for line in text.splitlines() if line.strip().lower().startswith('home')), '')
home = home_line.split('=', 1)[1].strip() if '=' in home_line else ''
expected = Path(r'$BundledPythonHome').resolve()
actual = Path(home).resolve() if home else None
if actual != expected:
    raise SystemExit(f'pyvenv home mismatch: {actual} != {expected}')
dlls = list(expected.glob('python3*.dll'))
if not dlls:
    raise SystemExit('bundled _Python is missing python3*.dll')
print('portable home ok:', expected)
print('portable dlls:', ', '.join(p.name for p in dlls))
"@
    if ($LASTEXITCODE -ne 0) {
        throw "Portability check failed."
    }

    if ($BuildWheelhouse) {
        $Wheelhouse = Join-Path $PackageRoot "wheelhouse"
        New-Item -ItemType Directory -Force -Path $Wheelhouse | Out-Null
        Write-Host "[wheelhouse] downloading wheels: $Wheelhouse"
        Invoke-Pip -VenvPython $VenvPython -PipArgs @("download", "-r", $Requirements, "-d", $Wheelhouse)
    }
}
else {
    Write-Host "[venv] skipped by -SkipVenv"
}

if ($Zip) {
    $ZipPath = "$PackageRoot.zip"
    if (Test-Path $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }
    Write-Host "[zip] $ZipPath"
    Get-ChildItem -LiteralPath $PackageRoot -Force |
        Compress-Archive -DestinationPath $ZipPath -Force
}

Write-Host "[done] portable package is ready."
Write-Host "[done] start with: $PackageRoot\start.bat"
