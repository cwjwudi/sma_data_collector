# Delete legacy frontend\release* (run migrate-legacy-release.ps1 first to keep artifacts).
$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Legacy = @('release', 'release-mac', 'release-alt', 'release-installer')

Write-Host 'Cleaning legacy electron-builder dirs under frontend\ ...'
foreach ($name in $Legacy) {
  $target = Join-Path $FrontendRoot $name
  if (Test-Path -LiteralPath $target) {
    Write-Host "  Removing $target"
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Write-Host 'OK. Use packaging\windows\output and packaging\mac\output for new builds.'
