# 释放 win-unpacked 占用后删除目录。
# 用法: .\clean-release.ps1                              # packaging\windows\output
#       .\clean-release.ps1 ..\..\packaging\windows\output-alt
param(
    [Parameter(Position = 0)]
    [string]$OutputFolderName = '..\..\packaging\windows\output'
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$OutRoot = Join-Path $FrontendRoot $OutputFolderName
$Unpack = Join-Path $OutRoot 'win-unpacked'

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

$parent = [System.IO.Path]::GetDirectoryName($UnpackFull)
if (-not $parent) {
    throw "Cannot get parent directory of: $UnpackFull"
}
$trashName = 'win-unpacked._trash_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
$trashPath = [System.IO.Path]::Combine($parent, $trashName)

try {
    Rename-Item -LiteralPath $UnpackFull -NewName $trashName -ErrorAction Stop
    Write-Host "OK: renamed locked folder to: $trashPath"
    Write-Host "Delete the _trash_ folder later when no editor holds app.asar (or after Cursor reload). Next build is unblocked."
    exit 0
}
catch {
    Write-Host ""
    Write-Host "Still blocked. Options:"
    Write-Host "  1) Close tabs/preview under frontend/$OutputFolderName/win-unpacked, reload Cursor, retry clean:release."
    Write-Host "  2) Build to alternate output: npm.cmd run dist:cn:alt - artifacts go to packaging/windows/output-alt/"
    throw
}
