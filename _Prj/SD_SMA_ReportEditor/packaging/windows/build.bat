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
  echo   1. Node.js not installed or wrong version - use LTS 20.x or 22.x from https://nodejs.org/
  echo   2. Node.js 24+ with npm ci EBADENGINE - pull latest build.ps1 ^(auto --ignore-engines^) or install Node 22
  echo   3. vite build OOM - script sets NODE_OPTIONS=--max-old-space-size=8192; try Node 22 LTS
  echo   4. Python not installed - https://www.python.org/ ^(check "py launcher"^)
  echo   5. Network blocked npm / Electron download - try again or use VPN
  echo   6. winCodeSign symlink - delete %%LOCALAPPDATA%%\electron-builder\Cache\winCodeSign
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
