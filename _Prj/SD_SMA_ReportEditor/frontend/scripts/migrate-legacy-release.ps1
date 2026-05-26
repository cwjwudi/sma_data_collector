# Move legacy frontend\release* into packaging\*\output
$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$ProjectRoot = (Resolve-Path (Join-Path $FrontendRoot '..')).Path
$WinOut = Join-Path $ProjectRoot 'packaging\windows\output'
$WinAlt = Join-Path $ProjectRoot 'packaging\windows\output-alt'
$MacOut = Join-Path $ProjectRoot 'packaging\mac\output'

function Move-LegacyContents {
  param(
    [string]$SourceRel,
    [string]$DestRoot,
    [string]$Label
  )
  $src = Join-Path $FrontendRoot $SourceRel
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "[skip] ${Label}: not found ($src)"
    return
  }
  New-Item -ItemType Directory -Force -Path $DestRoot | Out-Null
  $moved = 0
  Get-ChildItem -LiteralPath $src -Force | ForEach-Object {
    $dest = Join-Path $DestRoot $_.Name
    if (Test-Path -LiteralPath $dest) {
      Write-Host "[warn] ${Label}: dest already has $($_.Name) — skip"
      return
    }
    Write-Host "[move] $($_.FullName) -> $dest"
    Move-Item -LiteralPath $_.FullName -Destination $dest
    $moved++
  }
  $left = @(Get-ChildItem -LiteralPath $src -Force -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) {
    Remove-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue
    Write-Host "[ok] removed empty $src"
  }
  Write-Host "[done] ${Label}: moved $moved item(s) -> $DestRoot"
}

Write-Host 'Migrating legacy electron-builder output under frontend\ ...'
Move-LegacyContents -SourceRel 'release' -DestRoot $WinOut -Label 'release (Windows)'
Move-LegacyContents -SourceRel 'release-alt' -DestRoot $WinAlt -Label 'release-alt'
Move-LegacyContents -SourceRel 'release-installer' -DestRoot $WinOut -Label 'release-installer'
Move-LegacyContents -SourceRel 'release-mac' -DestRoot $MacOut -Label 'release-mac (macOS)'
Write-Host ''
Write-Host "macOS target: $MacOut"
Write-Host 'If release-mac is missing, run packaging\windows\build.bat or packaging\mac\build.sh'
