@echo off
setlocal
chcp 936 >nul 2>&1
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = 8091,8092,8093; " ^
  "$conns = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue; " ^
  "if (-not $conns) { Write-Host 'No SD SMA launcher services are listening on 8091/8092.'; exit 0 }; " ^
  "$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($pid in $pids) { " ^
  "  $proc = Get-CimInstance Win32_Process -Filter \"ProcessId=$pid\" -ErrorAction SilentlyContinue; " ^
  "  if ($proc -and $proc.CommandLine -match 'uvicorn (web_config.main:app|app.main:app)') { " ^
  "    Write-Host \"Stopping PID ${pid}: $($proc.CommandLine)\"; Stop-Process -Id $pid -Force " ^
  "  } else { " ^
  "    Write-Host \"Skip PID $pid because it does not look like an SD SMA uvicorn service.\" " ^
  "  } " ^
  "}"
pause
endlocal
