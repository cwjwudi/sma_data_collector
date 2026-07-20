@echo off
setlocal
chcp 65001 >nul 2>&1
title SD SMA Package Builder

set "BUILD_MODE=%~1"
if /i "%BUILD_MODE%"=="installer" goto installer
if /i "%BUILD_MODE%"=="portable" shift

echo ========================================
echo   SD SMA Runtime Portable Package Builder
echo ========================================
echo.
echo Output: %~dp0..\_Build\SD_SMA_Runtime_Package
echo PyPI:   https://pypi.tuna.tsinghua.edu.cn/simple
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_portable_package.ps1" %*
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo [OK] Portable package generated:
  echo   %~dp0..\_Build\SD_SMA_Runtime_Package
  echo.
  echo Copy the whole directory to the target PC and run start.bat.
) else (
  echo [FAILED] Package build failed. Exit code: %ERR%
  echo Scroll up to inspect the error details.
)

echo.
pause
endlocal & exit /b %ERR%

:installer
shift
echo ========================================
echo   SD SMA Lightweight Installer Builder
echo ========================================
echo.
echo Output: %~dp0..\_Build\Installer
echo Layout: one Launcher EXE + one shared Python runtime
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_installer_package.ps1" %*
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo [OK] Installer generated under:
  echo   %~dp0..\_Build\Installer
) else (
  echo [FAILED] Installer build failed. Exit code: %ERR%
  echo Scroll up to inspect the error details.
)

echo.
pause
endlocal & exit /b %ERR%
