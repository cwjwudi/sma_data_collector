# Waits until Vite answers on 127.0.0.1:5173, then opens default browser (used by start_dev_web.bat).
$ErrorActionPreference = 'SilentlyContinue'

$viteUrl = 'http://127.0.0.1:5173/'
$openUrl = 'http://127.0.0.1:5173/'
$timeoutSec = 120
$intervalMs = 400

$deadline = (Get-Date).AddSeconds($timeoutSec)
Write-Host "[3/3] Waiting for Vite to accept connections ($viteUrl) ..." -ForegroundColor Cyan
Write-Host "      (first run / cold start can take more than a few seconds)" -ForegroundColor DarkGray

while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri $viteUrl -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 3
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      Write-Host 'Vite is up. Opening browser...' -ForegroundColor Green
      Start-Process $openUrl
      exit 0
    }
  } catch {
    # still starting, or strictPort bind failed — keep polling until timeout
  }
  Start-Sleep -Milliseconds $intervalMs
}

Write-Host ''
Write-Host "TIMEOUT after ${timeoutSec}s: nothing answered on port 5173." -ForegroundColor Red
Write-Host 'Check the SD_SMA_ReportEditor - Frontend window: npm errors, or port already in use (strictPort).' -ForegroundColor Yellow
Write-Host 'If the port is stuck, run stop_dev_web.bat then start again.' -ForegroundColor Yellow
exit 1
