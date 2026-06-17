param(
    [string]$OutputDir = "",
    [string]$Python = "python",
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

$env:HTTP_PROXY = "http://192.168.50.122:7890"
$env:HTTPS_PROXY = "http://192.168.50.122:7890"
$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:http_proxy = $env:HTTP_PROXY
$env:https_proxy = $env:HTTPS_PROXY
$env:no_proxy = $env:NO_PROXY

function Copy-DirectoryFiltered {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $sourceRoot = (Resolve-Path $Source).Path
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    $skipDirectoryNames = @(
        ".git", ".pytest_cache", ".mypy_cache", "__pycache__", "venv", ".venv",
        "logs", "dist", "node_modules"
    )
    $skipFileExtensions = @(".pyc", ".pyo", ".log")

    Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force | ForEach-Object {
        $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\", "/")
        if ([string]::IsNullOrWhiteSpace($relative)) {
            return
        }

        $parts = $relative -split "[\\/]"
        foreach ($part in $parts) {
            if ($skipDirectoryNames -contains $part) {
                return
            }
        }

        $target = Join-Path $Destination $relative
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
            return
        }

        if ($skipFileExtensions -contains $_.Extension.ToLowerInvariant()) {
            return
        }

        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

Write-Host "[package] output: $PackageRoot"

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

Copy-DirectoryFiltered `
    -Source (Join-Path $RepoRoot "_Prj\SD_SMA_DATA_COLLECTOR") `
    -Destination (Join-Path $PackageProjects "SD_SMA_DATA_COLLECTOR")
Copy-DirectoryFiltered `
    -Source (Join-Path $RepoRoot "_Prj\SD_SMA_DATA_COLLECTOR_QUERY_WEB") `
    -Destination (Join-Path $PackageProjects "SD_SMA_DATA_COLLECTOR_QUERY_WEB")
Copy-DirectoryFiltered `
    -Source (Join-Path $RepoRoot "_Prj\SD_SMA_DB_ADMIN") `
    -Destination (Join-Path $PackageProjects "SD_SMA_DB_ADMIN")
Copy-DirectoryFiltered `
    -Source (Join-Path $RepoRoot "_Prj\SD_SMA_REPORT_COPY") `
    -Destination (Join-Path $PackageProjects "SD_SMA_REPORT_COPY")

$RootStart = Join-Path $PackageRoot "start.bat"
@"
@echo off
setlocal
cd /d "%~dp0_Launcher"
call start.bat %*
endlocal
"@ | Set-Content -LiteralPath $RootStart -Encoding ASCII

if (-not $SkipVenv) {
    $VenvDir = Join-Path $PackageRoot ".venv"
    if (Test-Path $VenvDir) {
        Remove-Item -LiteralPath $VenvDir -Recurse -Force
    }

    Write-Host "[venv] creating: $VenvDir"
    & $Python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }

    $VenvPython = Join-Path $VenvDir "Scripts\python.exe"
    Write-Host "[venv] upgrading pip"
    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upgrade pip."
    }

    Write-Host "[venv] installing unified requirements"
    & $VenvPython -m pip install -r $Requirements
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install unified requirements."
    }

    Write-Host "[venv] dependency check"
    & $VenvPython -m pip check
    if ($LASTEXITCODE -ne 0) {
        throw "pip check failed."
    }

    if ($BuildWheelhouse) {
        $Wheelhouse = Join-Path $PackageRoot "wheelhouse"
        New-Item -ItemType Directory -Force -Path $Wheelhouse | Out-Null
        Write-Host "[wheelhouse] downloading wheels: $Wheelhouse"
        & $VenvPython -m pip download -r $Requirements -d $Wheelhouse
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to build wheelhouse."
        }
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
