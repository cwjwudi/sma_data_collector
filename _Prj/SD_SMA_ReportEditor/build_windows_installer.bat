@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_windows_installer.ps1" %*
if errorlevel 1 exit /b 1
exit /b 0
