@echo off
setlocal
title SD_SMA_ReportEditor - Stop dev (web)

rem ASCII-only; save UTF-8 without BOM - BOM breaks @echo off under cmd.exe.

set "SCRIPT_DIR=%~dp0"

echo Cleaning listeners on 8000 ^(backend^) / 5173 ^(frontend^): process tree taskkill + short retries ...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop_dev_web.ps1"
echo.
echo If a page still loads, wait a moment and refresh, or run this script again ^(admin if access denied^).
echo.
pause
endlocal
