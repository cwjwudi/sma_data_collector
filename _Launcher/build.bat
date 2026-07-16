@echo off
setlocal
chcp 65001 >nul 2>&1
title SD SMA Portable Package Builder

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
