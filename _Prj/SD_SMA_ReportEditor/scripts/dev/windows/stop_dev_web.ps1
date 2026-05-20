# 一键停止本项目的开发服务（与 start_dev_web.bat 对应端口）
# 使用 taskkill /T 结束进程树，并短重试，便于 stop 后立即 start。
$ErrorActionPreference = 'SilentlyContinue'

# 与 start_dev_web 一致：后端 8000、Vite 5173。兼容升级前 Vite 曾漂移端口时，将下一行改为 $true。
$includeLegacyVite5174 = $false

$ports = @(8000, 5173)
if ($includeLegacyVite5174) {
  $ports = @(8000, 5173, 5174)
}

function Get-ListenProcessIds([int]$Port) {
  $rows = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess |
      Where-Object { $_ -and $_ -ne 0 })
  return @($rows | Sort-Object -Unique)
}

function Invoke-TaskKillTree([int]$ProcessId) {
  # 128：找不到进程 —— 视为已退出，不报错
  $null = cmd.exe /c "taskkill /F /T /PID $ProcessId >nul 2>&1"
  $code = $LASTEXITCODE
  return ($code -eq 0 -or $code -eq 128)
}

function Get-BusyPorts([int[]]$PortList) {
  $busy = @()
  foreach ($p in $PortList) {
    $conns = @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
    if ($conns.Count -gt 0) {
      $busy += $p
    }
  }
  return $busy
}

Write-Host 'SD_SMA_ReportEditor — 停止开发服务（进程树 taskkill /T + 短重试）' -ForegroundColor Cyan
Write-Host "监听端口: $($ports -join ', ')" -ForegroundColor DarkGray
Write-Host ''

$maxRounds = 3
$sleepMs = 450

for ($round = 1; $round -le $maxRounds; $round++) {
  $hadTargets = $false

  foreach ($p in $ports) {
    $procIds = Get-ListenProcessIds -Port $p
    foreach ($procId in $procIds) {
      $hadTargets = $true
      Write-Host "回合 $round — 端口 $p  PID $procId — taskkill /F /T"
      $ok = Invoke-TaskKillTree -ProcessId $procId
      if (-not $ok) {
        Write-Host '  （taskkill 未返回成功；若为权限不足，请以管理员重试或任务管理器中结束进程）' -ForegroundColor Yellow
      }
    }
  }

  if (-not $hadTargets -and $round -eq 1) {
    Write-Host '未发现占用上述端口的监听进程（端口本就空闲）。' -ForegroundColor DarkGray
  }

  Start-Sleep -Milliseconds $sleepMs

  $busyPorts = @(Get-BusyPorts -PortList $ports)
  if ($busyPorts.Count -eq 0) {
    Write-Host ''
    Write-Host '端口已全部释放，可立即运行 scripts\dev\windows\start_dev_web.bat。' -ForegroundColor Green
    exit 0
  }

  if ($round -lt $maxRounds) {
    Write-Host "仍有监听端口: $($busyPorts -join ', ') — 将在下一轮继续清理..." -ForegroundColor DarkYellow
    Write-Host ''
  }
}

Write-Host ''
Write-Host "下列端口仍有监听（可能被其它程序占用，或无权限结束进程）: $($busyPorts -join ', ')" -ForegroundColor Red
Write-Host '请以管理员身份重新运行本脚本，或在任务管理器中结束占用进程后再试。' -ForegroundColor Yellow
exit 1
