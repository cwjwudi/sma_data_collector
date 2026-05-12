@echo off
setlocal
title SD_SMA_ReportEditor - Start dev (web)

rem Keep this file ASCII-only so cmd.exe parses it correctly on all system locales.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

if not exist "%BACKEND%\main.py" (
  echo [ERROR] Missing "%BACKEND%\main.py". Run this .bat from SD_SMA_ReportEditor repo root.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

echo [1/3] Starting backend ^(127.0.0.1:8000^) ...
start "SD_SMA_ReportEditor - Backend" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BACKEND%\scripts\dev_uvicorn.ps1"

ping 127.0.0.1 -n 3 >nul

echo [2/3] Starting frontend ^(http://127.0.0.1:5173^) ...
start "SD_SMA_ReportEditor - Frontend" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%FRONTEND%\scripts\dev_vite.ps1"

echo [3/3] Waiting until Vite responds, then opening browser ...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%FRONTEND%\scripts\wait_vite_then_open_browser.ps1"

echo.
echo Backend and frontend were started in new windows; browser should open.
echo Stop: close those windows or Ctrl+C inside them, or run stop_dev_web.bat
echo This window closes in ~12 seconds ^(no key press needed^).
echo.
ping 127.0.0.1 -n 13 >nul
endlocal
