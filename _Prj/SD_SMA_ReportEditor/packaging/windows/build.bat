@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Skip "Press any key" on failure: pass -NoPause, or set REPORT_EDITOR_BUILD_NO_PAUSE=1
set "NO_PAUSE=0"
if /i "%REPORT_EDITOR_BUILD_NO_PAUSE%"=="1" set "NO_PAUSE=1"

set "FWD_ARGS="
:parse_args
if "%~1"=="" goto run_build
if /i "%~1"=="-NoPause" set "NO_PAUSE=1" & shift & goto parse_args
if /i "%~1"=="-nopause" set "NO_PAUSE=1" & shift & goto parse_args
set "FWD_ARGS=%FWD_ARGS% %1"
shift
goto parse_args

:run_build
echo.
echo == Report Editor Windows Build ==
echo Tip: run "git pull" in repo first; version from frontend\package.json ^(target 0.2.4^).
echo       Release notes come from packaging\updates\latest.json - shown in app update UI.
echo Directory: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %FWD_ARGS%
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
  echo   7. Version mismatch or stale output - use: build.bat -Fresh
  echo   8. Wrong installer version in output - always use -Fresh for release builds
  echo.
  echo Tip: open cmd, cd to this folder, run build.bat to keep the full log.
  echo      Add -NoPause to skip "Press any key" on failure.
  echo.
  if "%NO_PAUSE%"=="0" pause
  exit /b %EXITCODE%
)

echo.
echo [OK] Build finished. Installer is under packaging\windows\output\
echo.
exit /b 0
