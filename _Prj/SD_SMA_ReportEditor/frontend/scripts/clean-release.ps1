# 释放 win-unpacked 占用后删除目录，供 npm run clean:release 调用
# 使用 Win32_Process.ExecutablePath：比 Get-Process .Path 更稳，便于扫全 Electron 子进程与 report_backend
$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendRoot = Resolve-Path (Join-Path $ScriptDir '..')
$Unpack = Join-Path $FrontendRoot 'release\win-unpacked'

if (-not (Test-Path $Unpack)) {
    Write-Host "OK: nothing to clean ($Unpack)"
    exit 0
}

$UnpackFull = (Resolve-Path $Unpack).Path.TrimEnd('\')

function Stop-ProcessesUnderUnpack([string] $Root) {
    Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
        $ep = $_.ExecutablePath
        if (-not $ep) { return }
        if ($ep.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "Stopping PID $($_.ProcessId) $ep"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

foreach ($pass in 1..3) {
    Stop-ProcessesUnderUnpack -Root $UnpackFull
    Start-Sleep -Seconds 1
}

if (-not (Test-Path $Unpack)) {
    Write-Host "OK: folder already gone"
    exit 0
}

try {
    Remove-Item -LiteralPath $Unpack -Recurse -Force -ErrorAction Stop
    Write-Host "OK: removed $UnpackFull"
    exit 0
}
catch {
    Write-Host "Remove failed, trying rename-aside (so next dist can use a fresh win-unpacked)..."
}

$parent = Split-Path -LiteralPath $UnpackFull -Parent
$trashName = 'win-unpacked._trash_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
$trashPath = Join-Path $parent $trashName

try {
    Rename-Item -LiteralPath $UnpackFull -NewName $trashName -ErrorAction Stop
    Write-Host "OK: renamed locked folder to: $trashPath"
    Write-Host "Delete the _trash_ folder later when no editor holds app.asar (or after Cursor reload). Next build is unblocked."
    exit 0
}
catch {
    Write-Host ""
    Write-Host "Still blocked. Do this:"
    Write-Host "  1) Close ALL tabs/preview under frontend/release/win-unpacked (including .exe / app.asar)."
    Write-Host "  2) Repo root .cursorignore should list frontend/release/ — reload Cursor window (Developer: Reload Window)."
    Write-Host "  3) Retry: npm.cmd run clean:release"
    throw
}
