#Requires -Version 5.1
<#
.SYNOPSIS
  启动本机 MariaDB（无需 Docker；用于 044 冒烟）。

说明：当前环境 Docker Desktop 因缺 WSL2 虚拟化支持无法启动，
故用 winget 安装的 MariaDB 12.3 以后台进程方式跑在 3306。
#>
$ErrorActionPreference = 'Stop'
$mysqld = 'C:\Program Files\MariaDB 12.3\bin\mariadbd.exe'
$ini = 'C:\Program Files\MariaDB 12.3\data\my.ini'
if (-not (Test-Path $mysqld)) { throw "未找到 $mysqld。请先: winget install MariaDB.Server" }

$tnc = Test-NetConnection 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
if ($tnc.TcpTestSucceeded) {
  Write-Host '[OK] MariaDB 已在 3306 监听'
  exit 0
}

$log = Join-Path $env:TEMP 'mariadbd-044.log'
Write-Host '== starting mariadbd =='
Start-Process -FilePath $mysqld -ArgumentList @("--defaults-file=`"$ini`"") -RedirectStandardError $log -WindowStyle Hidden | Out-Null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  $tnc = Test-NetConnection 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
  if ($tnc.TcpTestSucceeded) {
    Write-Host '[OK] MariaDB ready on 127.0.0.1:3306  root / report_editor_044'
    exit 0
  }
}
Write-Host '[FAILED] 启动超时，见日志:' $log
if (Test-Path $log) { Get-Content $log -Tail 40 }
exit 1
