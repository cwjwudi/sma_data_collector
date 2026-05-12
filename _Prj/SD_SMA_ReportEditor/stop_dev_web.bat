@echo off
chcp 65001 >nul
setlocal
title SD_SMA_ReportEditor 停止开发服务

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

echo 正在结束占用 8000（后端）与 5173（前端）的监听进程…
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\stop_dev_web.ps1"
echo.
echo 若仍有页面可访问，请稍等几秒后刷新；或再运行本脚本一次。
echo.
pause
