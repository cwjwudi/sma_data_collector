@echo off
setlocal
title SD_SMA_ReportEditor - Stop dev (web)

rem ASCII-only for reliable cmd parsing on all locales.

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

echo Stopping listeners on port 8000 ^(backend^) and 5173 ^(frontend^) ...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\stop_dev_web.ps1"
echo.
echo If a page still loads, wait a few seconds and refresh, or run this script again.
echo.
pause
endlocal
