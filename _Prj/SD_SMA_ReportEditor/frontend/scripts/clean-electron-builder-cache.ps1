# 清理 electron-builder NSIS 缓存（损坏时会出现 Plugin not found UAC::_）
$base = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\nsis"
if (-not (Test-Path $base)) {
    Write-Host "OK: no nsis cache at $base"
    exit 0
}
Write-Host "Removing: $base"
Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction Stop
Write-Host "OK. Retry: npm.cmd run dist:cn:alt"
