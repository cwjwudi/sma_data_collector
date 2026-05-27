@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_portable_package.ps1" %*
endlocal
