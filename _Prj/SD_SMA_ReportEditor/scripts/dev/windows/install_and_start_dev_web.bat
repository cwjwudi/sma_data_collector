@echo off
setlocal
title SD_SMA_ReportEditor - Install and start dev

rem ASCII-only; save UTF-8 without BOM - BOM breaks @echo off under cmd.exe.

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%install_and_start_dev_web.ps1"

if not exist "%PS1%" (
  echo [ERROR] Missing "%PS1%".
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
  echo [ERROR] Install/start failed with exit code %CODE%.
  echo Check the messages above, then run this script again.
  pause
  exit /b %CODE%
)

echo [OK] Install/start flow completed.
echo This window closes in ~12 seconds. Dev service windows remain open.
ping 127.0.0.1 -n 13 >nul
endlocal

