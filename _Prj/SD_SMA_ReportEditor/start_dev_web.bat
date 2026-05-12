@echo off
chcp 65001 >nul
setlocal
rem 专用标题，便于在任务栏识别本窗口
title SD_SMA_ReportEditor 启动说明

rem 一键启动：FastAPI 后端 + Vite 前端（浏览器访问）
rem 请将本文件放在 SD_SMA_ReportEditor 根目录（与 backend、frontend 同级）

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

if not exist "%BACKEND%\main.py" (
  echo [错误] 未找到 backend\main.py，请确认本 bat 位于 SD_SMA_ReportEditor 根目录。
  echo 本窗口约 30 秒后自动关闭，请阅读上述错误信息。
  timeout /t 30 /nobreak >nul
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
echo 【关服务】请切到标题含 Backend / Frontend 的两个 PowerShell 窗口，Ctrl+C 或直接关闭。
echo 【本说明窗口】不再等待按键（避免误点结束）；约 12 秒后自动关闭，不影响已启动的服务。
echo.
timeout /t 12 /nobreak
endlocal
