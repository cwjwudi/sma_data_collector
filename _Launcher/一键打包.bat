@echo off
setlocal
chcp 936 >nul 2>&1
cd /d "%~dp0.."
title SD SMA 一键打包

echo ========================================
echo   SD SMA Runtime 一键打包
echo ========================================
echo.
echo 输出目录: %cd%\_Build\SD_SMA_Runtime_Package
echo 国内源:   https://pypi.tuna.tsinghua.edu.cn/simple
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_portable_package.ps1" %*
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo [成功] 便携包已生成:
  echo   %cd%\_Build\SD_SMA_Runtime_Package
  echo.
  echo 现场使用: 复制整个目录后双击 start.bat
) else (
  echo [失败] 打包出错，退出码: %ERR%
  echo 请向上滚动查看错误信息。
)

echo.
pause
endlocal & exit /b %ERR%