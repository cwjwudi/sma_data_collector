@echo off
chcp 65001 >nul
setlocal
rem 专用标题，避免与「命令提示符」混淆；浏览器打开后本窗口常被挡在后面，请用任务栏或 Alt+Tab 找本标题
title SD_SMA_ReportEditor 启动说明

rem 一键启动：FastAPI 后端 + Vite 前端（浏览器访问）
rem 请将本文件放在 SD_SMA_ReportEditor 根目录（与 backend、frontend 同级）

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

if not exist "%BACKEND%\main.py" (
  echo [错误] 未找到 backend\main.py，请确认本 bat 位于 SD_SMA_ReportEditor 根目录。
  pause
  exit /b 1
)

echo [1/3] 启动后端 ^(127.0.0.1:8000^) ...
rem 使用 PowerShell 承载 uvicorn，避免旧版 cmd「快速编辑」点选挂起进程、关不掉窗口
start "SD_SMA_ReportEditor - Backend" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BACKEND%\scripts\dev_uvicorn.ps1"

timeout /t 2 /nobreak >nul

echo [2/3] 启动前端 ^(http://localhost:5173^) ...
start "SD_SMA_ReportEditor - Frontend" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%FRONTEND%\scripts\dev_vite.ps1"

echo [3/3] 等待 Vite 就绪后打开浏览器 ...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173/"

echo.
echo 已在新窗口启动后端与前端；浏览器应已打开报表编辑器页面。
echo.
echo 【本窗口】任务栏里请找标题为「SD_SMA_ReportEditor 启动说明」的窗口。
echo        若看不到：按 Alt+Tab 切换，或最小化浏览器再找该窗口。
echo 【关服务】请关闭或 Ctrl+C 标题含「Backend」「Frontend」的两个 PowerShell 窗口。
echo 【关本说明】下面按任意键后，本窗口会关闭（不影响已在运行的前后端）。
echo.
pause
endlocal
