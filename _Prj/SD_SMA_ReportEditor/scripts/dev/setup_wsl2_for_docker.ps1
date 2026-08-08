#Requires -Version 5.1
<#
.SYNOPSIS
  为本机准备 WSL2（供 Docker Desktop / 044 MariaDB 冒烟）。

.DESCRIPTION
  需「以管理员身份」运行。步骤：
  1. 启用 Windows Subsystem for Linux + 虚拟机平台
  2. wsl --update / 默认 WSL2
  3. 可选安装 Ubuntu（无发行版时）
  4. 提示重启后启动 Docker Desktop，再跑 setup_044_docker.ps1

.NOTES
  若固件未开 CPU 虚拟化（Intel VT-x / AMD-V），启用组件后 WSL2 仍会失败——需进 BIOS/UEFI 打开。
#>
$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]$id
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '请右键本脚本 →「使用 PowerShell 以管理员身份运行」，或在管理员终端执行。'
  }
}

function Enable-FeatureSafe([string]$Name) {
  $f = Get-WindowsOptionalFeature -Online -FeatureName $Name -ErrorAction SilentlyContinue
  if (-not $f) {
    Write-Host "[SKIP] 找不到可选组件: $Name"
    return $false
  }
  if ($f.State -eq 'Enabled') {
    Write-Host "[OK] 已启用: $Name"
    return $false
  }
  Write-Host "[..] 正在启用: $Name"
  $r = Enable-WindowsOptionalFeature -Online -FeatureName $Name -All -NoRestart
  Write-Host ("[OK] {0} → RestartNeeded={1}" -f $Name, $r.RestartNeeded)
  return [bool]$r.RestartNeeded
}

Assert-Admin
Write-Host '== 044 / Docker：准备 WSL2 =='
Write-Host ("用户: {0}" -f $env:USERNAME)
Write-Host ''

$needReboot = $false
foreach ($name in @(
  'Microsoft-Windows-Subsystem-Linux',
  'VirtualMachinePlatform'
)) {
  if (Enable-FeatureSafe $name) { $needReboot = $true }
}

Write-Host ''
Write-Host '== wsl --install --no-distribution =='
& wsl.exe --install --no-distribution --web-download
Write-Host ("wsl --install exit={0}" -f $LASTEXITCODE)

Write-Host ''
Write-Host '== wsl --update =='
& wsl.exe --update
Write-Host ("wsl --update exit={0}" -f $LASTEXITCODE)

Write-Host ''
Write-Host '== 默认版本 → 2 =='
& wsl.exe --set-default-version 2

Write-Host ''
Write-Host '== 当前状态 =='
& wsl.exe --status
& wsl.exe -l -v

$hasDistro = $false
try {
  $list = & wsl.exe -l -q 2>$null
  if ($list -and ($list | Where-Object { $_.Trim() })) { $hasDistro = $true }
} catch { }

if (-not $hasDistro) {
  Write-Host ''
  Write-Host '== 未检测到发行版，安装 Ubuntu（可取消）=='
  try {
    & wsl.exe --install -d Ubuntu --web-download
    Write-Host ("Ubuntu install exit={0}" -f $LASTEXITCODE)
  } catch {
    Write-Host ("[WARN] Ubuntu 安装失败（可稍后手动 wsl --install -d Ubuntu）: {0}" -f $_.Exception.Message)
  }
}

Write-Host ''
Write-Host '== 虚拟化提示 =='
Write-Host '若重启后仍报「未启用虚拟化」：进 BIOS/UEFI 打开 Intel VT-x / AMD-V / SVM，'
Write-Host '并确认 Windows「启用虚拟化的安全功能」相关设置未挡死（见 https://aka.ms/enablevirtualization ）。'
Write-Host ''

if ($needReboot) {
  Write-Host '[NEXT] 可选组件刚启用，必须重启后 WSL2 / Docker 才能起来。'
  Write-Host '重启后：'
} else {
  Write-Host '[NEXT] 若组件本已启用仍无法启动，也请重启一次再试。重启后：'
}

Write-Host '  1. 打开 Docker Desktop，等到绿色 Running'
Write-Host '  2. cd _Prj\SD_SMA_ReportEditor'
Write-Host '  3. .\scripts\dev\setup_044_docker.ps1'
Write-Host ''

$ans = Read-Host '是否现在重启电脑？(Y/N)'
if ($ans -match '^[Yy]') {
  Restart-Computer -Force
}
