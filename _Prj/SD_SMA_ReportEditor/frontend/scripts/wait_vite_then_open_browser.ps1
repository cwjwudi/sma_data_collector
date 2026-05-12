# Waits until Vite answers on 127.0.0.1:5173, then opens default browser (used by start_dev_web.bat).
# Uses fast TcpClient probes while port is closed (Invoke-WebRequest was ~2s per failure on PS 5.1 — see debug logs).
$ErrorActionPreference = 'SilentlyContinue'

$viteUrl = 'http://127.0.0.1:5173/'
$openUrl = 'http://127.0.0.1:5173/'
$timeoutSec = 120
$intervalMs = 400
$tcpProbeTimeoutMs = 300

#region agent log
$AgentRunId = 'post-fix'
$AgentDebugLogPath = Join-Path (Split-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent) -Parent) 'debug-1d8517.log'
function Write-AgentDebugNdjson([hashtable]$Payload) {
  $Payload['timestamp'] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $Payload['sessionId'] = '1d8517'
  if (-not $Payload.ContainsKey('runId')) {
    $Payload['runId'] = $AgentRunId
  }
  Add-Content -LiteralPath $AgentDebugLogPath -Value (($Payload | ConvertTo-Json -Compress -Depth 8)) -Encoding utf8
}
#endregion agent log

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
$scriptStartedAt = Get-Date

#region agent log
Write-AgentDebugNdjson @{ hypothesisId = 'verify_tcp_probe'; location = 'wait_vite_then_open_browser.ps1:start'; message = 'wait_script_begin'; data = @{ viteUrl = $viteUrl; timeoutSec = $timeoutSec; intervalMs = $intervalMs; tcpProbeTimeoutMs = $tcpProbeTimeoutMs; probeStrategy = 'tcp_then_http'; pwshVersion = $PSVersionTable.PSVersion.ToString() }; runId = $AgentRunId }
#endregion agent log

Write-Host "[3/3] Waiting for Vite to accept connections ($viteUrl) ..." -ForegroundColor Cyan
Write-Host "      (first run / cold start can take more than a few seconds)" -ForegroundColor DarkGray

$attempt = 0
while ((Get-Date) -lt $deadline) {
  $attempt++
  $elapsedMs = [math]::Round(((Get-Date) - $scriptStartedAt).TotalMilliseconds)

  $swTcp = [System.Diagnostics.Stopwatch]::StartNew()
  $tcpOk = Test-TcpPortOpen -ComputerName '127.0.0.1' -Port 5173 -TimeoutMs $tcpProbeTimeoutMs
  $swTcp.Stop()
  $tcpInvokeMs = [math]::Round($swTcp.Elapsed.TotalMilliseconds)

  if (-not $tcpOk) {
    #region agent log
    $shouldLog = ($attempt -le 15) -or (($attempt % 5 -eq 0))
    if ($shouldLog) {
      Write-AgentDebugNdjson @{ hypothesisId = 'verify_tcp_probe'; location = 'wait_vite_then_open_browser.ps1:poll'; message = 'probe_tick'; data = @{ phase = 'tcp'; attempt = $attempt; elapsedMs = $elapsedMs; invokeMs = $tcpInvokeMs; outcome = 'tcp_closed' }; runId = $AgentRunId }
    }
    #endregion agent log
    Start-Sleep -Milliseconds $intervalMs
    continue
  }

  $swHttp = [System.Diagnostics.Stopwatch]::StartNew()
  $statusCode = $null
  $httpOk = $false
  try {
    $r = Invoke-WebRequest -Uri $viteUrl -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 3
    $swHttp.Stop()
    $statusCode = [int]$r.StatusCode
    $httpOk = ($statusCode -ge 200 -and $statusCode -lt 500)
  } catch {
    $swHttp.Stop()
    $httpOk = $false
  }
  $httpInvokeMs = [math]::Round($swHttp.Elapsed.TotalMilliseconds)

  if (-not $httpOk) {
    #region agent log
    Write-AgentDebugNdjson @{ hypothesisId = 'verify_tcp_probe'; location = 'wait_vite_then_open_browser.ps1:poll'; message = 'probe_tick'; data = @{ phase = 'http_after_tcp'; attempt = $attempt; elapsedMs = $elapsedMs; tcpInvokeMs = $tcpInvokeMs; invokeMs = $httpInvokeMs; outcome = 'http_not_ready'; statusCode = $statusCode }; runId = $AgentRunId }
    #endregion agent log
    Start-Sleep -Milliseconds $intervalMs
    continue
  }

  Write-Host 'Vite is up. Opening browser...' -ForegroundColor Green
  #region agent log
  Write-AgentDebugNdjson @{ hypothesisId = 'verify_tcp_probe'; location = 'wait_vite_then_open_browser.ps1:success'; message = 'vite_ready'; data = @{ attempt = $attempt; elapsedMs = $elapsedMs; tcpInvokeMs = $tcpInvokeMs; httpInvokeMs = $httpInvokeMs; statusCode = $statusCode }; runId = $AgentRunId }
  #endregion agent log
  Start-Process $openUrl
  exit 0
}

Write-Host ''
Write-Host "TIMEOUT after ${timeoutSec}s: nothing answered on port 5173." -ForegroundColor Red
#region agent log
Write-AgentDebugNdjson @{ hypothesisId = 'verify_tcp_probe'; location = 'wait_vite_then_open_browser.ps1:timeout'; message = 'wait_timeout'; data = @{ attempts = $attempt; timeoutSec = $timeoutSec }; runId = $AgentRunId }
#endregion agent log
Write-Host 'Check the SD_SMA_ReportEditor - Frontend window: npm errors, or port already in use (strictPort).' -ForegroundColor Yellow
Write-Host 'If the port is stuck, run stop_dev_web.bat then start again.' -ForegroundColor Yellow
exit 1
