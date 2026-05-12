# 一键停止本项目的开发服务（与 start_dev_web.bat 对应端口）
$ErrorActionPreference = 'SilentlyContinue'
$ports = @(8000, 5173)
foreach ($p in $ports) {
  $pids = @(Get-NetTCPConnection -LocalPort $p -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($procId in $pids) {
    if ($procId -and $procId -ne 0) {
      Write-Host "端口 $p  PID $procId"
      Stop-Process -Id $procId -Force
    }
  }
}
