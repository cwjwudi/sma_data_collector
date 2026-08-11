#Requires -RunAsAdministrator
#Requires -Version 5.1
<#
.SYNOPSIS
  管理员一键：启用 WSL2 / 虚拟机平台，修好 Docker Desktop 虚拟化依赖。

用法（普通用户终端）：
  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "...\fix_docker_wsl2_admin.ps1"'
#>
$ErrorActionPreference = 'Continue'
$log = Join-Path $env:TEMP 'fix-docker-wsl2.log'
function Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
  $line | Tee-Object -FilePath $log -Append
}

Log '==== fix Docker/WSL2 start ===='
Log ("User={0} Elevated={1}" -f $env:USERNAME, ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

$features = @(
  'Microsoft-Windows-Subsystem-Linux',
  'VirtualMachinePlatform',
  'HypervisorPlatform'
)

foreach ($f in $features) {
  Log "Enable feature: $f"
  $r = Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -ErrorAction SilentlyContinue
  if ($null -eq $r) {
    # DISM fallback
    $p = Start-Process -FilePath dism.exe -ArgumentList @('/Online','/Enable-Feature',"/FeatureName:$f",'/All','/NoRestart') -Wait -PassThru -NoNewWindow
    Log "dism $f exit=$($p.ExitCode)"
  } else {
    Log ("feature {0} RestartNeeded={1} State={2}" -f $f, $r.RestartNeeded, $r.State)
  }
}

Log 'wsl --install --no-distribution'
$p = Start-Process -FilePath wsl.exe -ArgumentList @('--install','--no-distribution') -Wait -PassThru -NoNewWindow
Log "wsl --install exit=$($p.ExitCode)"

Log 'wsl --update'
$p = Start-Process -FilePath wsl.exe -ArgumentList @('--update') -Wait -PassThru -NoNewWindow
Log "wsl --update exit=$($p.ExitCode)"

Log 'wsl --set-default-version 2'
$p = Start-Process -FilePath wsl.exe -ArgumentList @('--set-default-version','2') -Wait -PassThru -NoNewWindow
Log "set-default-version exit=$($p.ExitCode)"

# Ubuntu 可选：有助于 WSL2 真正落地
Log 'wsl --install -d Ubuntu --no-launch (optional)'
$p = Start-Process -FilePath wsl.exe -ArgumentList @('--install','-d','Ubuntu','--no-launch') -Wait -PassThru -NoNewWindow
Log "ubuntu install exit=$($p.ExitCode)"

Log '==== feature states ===='
foreach ($f in $features) {
  try {
    $st = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
    Log "$f=$st"
  } catch {
    Log "$f=query_failed"
  }
}

Log '==== wsl status ===='
& wsl.exe --status 2>&1 | ForEach-Object { Log "$_" }
& wsl.exe -l -v 2>&1 | ForEach-Object { Log "$_" }

$needReboot = $true
Log '==== DONE ===='
Log "日志: $log"
Log '请重启电脑，再打开 Docker Desktop。'
Write-Host ''
Write-Host "完成。日志: $log" -ForegroundColor Green
Write-Host '必须重启电脑后，再启动 Docker Desktop。' -ForegroundColor Yellow
Write-Host '按任意键关闭...'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
