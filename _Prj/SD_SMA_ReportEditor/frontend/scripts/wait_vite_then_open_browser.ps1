# Waits until Vite answers on 127.0.0.1:5173, then opens default browser (used by scripts\dev\windows\start_dev_web.bat).
# Fast TcpClient probes while the port is closed; Invoke-WebRequest alone costs ~2s per failed attempt on Windows PowerShell 5.1.
$ErrorActionPreference = 'SilentlyContinue'

$viteUrl = 'http://127.0.0.1:5173/'
$openUrl = 'http://127.0.0.1:5173/'
$timeoutSec = 120
$intervalMs = 400
$tcpProbeTimeoutMs = 300

function Test-TcpPortOpen {
  param(
    [string]$ComputerName = '127.0.0.1',
    [int]$Port = 5173,
    [int]$TimeoutMs = 300
  )
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($ComputerName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch { }
  }
}

$deadline = (Get-Date).AddSeconds($timeoutSec)

Write-Host "[3/3] Waiting for Vite to accept connections ($viteUrl) ..." -ForegroundColor Cyan
Write-Host "      (first run / cold start can take more than a few seconds)" -ForegroundColor DarkGray

while ((Get-Date) -lt $deadline) {
  if (-not (Test-TcpPortOpen -ComputerName '127.0.0.1' -Port 5173 -TimeoutMs $tcpProbeTimeoutMs)) {
    Start-Sleep -Milliseconds $intervalMs
    continue
  }

  try {
    $r = Invoke-WebRequest -Uri $viteUrl -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 3
    $statusCode = [int]$r.StatusCode
    if ($statusCode -ge 200 -and $statusCode -lt 500) {
      Write-Host 'Vite is up. Opening browser...' -ForegroundColor Green
      Start-Process $openUrl
      exit 0
    }
  } catch {
    # Port accepting TCP but HTTP not ready yet — retry.
  }

  Start-Sleep -Milliseconds $intervalMs
}

Write-Host ''
Write-Host "TIMEOUT after ${timeoutSec}s: nothing answered on port 5173." -ForegroundColor Red
Write-Host 'Check the SD_SMA_ReportEditor - Frontend window: npm errors, or port already in use (strictPort).' -ForegroundColor Yellow
Write-Host 'If the port is stuck, run scripts\dev\windows\stop_dev_web.bat then start again.' -ForegroundColor Yellow
exit 1
