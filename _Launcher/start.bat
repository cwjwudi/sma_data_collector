@echo off
setlocal
chcp 936 >nul 2>&1
cd /d "%~dp0"
title SD SMA Unified Launcher
set "BUNDLED_PYTHON=%~dp0..\.venv\Scripts\python.exe"
if exist "%BUNDLED_PYTHON%" (
  "%BUNDLED_PYTHON%" sd_sma_launcher.py %*
) else (
  python sd_sma_launcher.py %*
)
echo.
echo Launcher exited.
pause
endlocal
