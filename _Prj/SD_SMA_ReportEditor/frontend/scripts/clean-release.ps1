# 释放 win-unpacked 占用后删除目录，供 npm run clean:release 调用
$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendRoot = Resolve-Path (Join-Path $ScriptDir '..')
$Unpack = Join-Path $FrontendRoot 'release\win-unpacked'

if (-not (Test-Path $Unpack)) {
    Write-Host "OK: nothing to clean ($Unpack)"
    exit 0
}

$UnpackFull = (Resolve-Path $Unpack).Path.TrimEnd('\')

# 结束工作目录或可执行路径位于 win-unpacked 下的进程（含 Electron 子进程、report_backend）
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $p = $_
    try {
        $path = $p.Path
        if (-not $path) { return }
        $pathNorm = $path.TrimEnd('\')
        if ($pathNorm.StartsWith($UnpackFull + '\', [StringComparison]::OrdinalIgnoreCase) -or
            $pathNorm.Equals($UnpackFull, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "Stopping PID $($p.Id) $pathNorm"
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch {
        # 部分系统进程无法访问 Path
    }
}

Start-Sleep -Milliseconds 600

if (Test-Path $Unpack) {
    Remove-Item -LiteralPath $Unpack -Recurse -Force -ErrorAction Stop
}
Write-Host "OK: removed $UnpackFull"
