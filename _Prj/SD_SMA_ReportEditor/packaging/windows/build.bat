@echo off
setlocal
cd /d "%~dp0"

echo.
echo == Report Editor Windows Build ==
echo Directory: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [FAILED] Build exited with code %EXITCODE%.
  echo.
  echo Common causes:
  echo   1. Node.js not installed - https://nodejs.org/ ^(LTS 20.x or 22.x^)
  echo   2. Python not installed - https://www.python.org/ ^(check "py launcher"^)
  echo   3. Network blocked npm / Electron download - try again or use VPN
  echo.
  echo Tip: open cmd, cd to this folder, run build.bat to keep the full log.
  echo.
  pause
  exit /b %EXITCODE%
)

echo.
echo [OK] Build finished. Installer is under packaging\windows\output\
echo.
pause
exit /b 0
