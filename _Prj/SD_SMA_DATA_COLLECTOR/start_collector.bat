@echo off
setlocal
rem Single launcher: Web UI + embedded collector control (same Python process).
chcp 936 >nul 2>&1
cd /d "%~dp0"
title SD SMA Collector
echo.
echo   SD_SMA_DATA_COLLECTOR
echo   Web UI: http://127.0.0.1:8091
echo   Start/stop collection from the monitor panel in the browser.
echo.
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
pause
endlocal
