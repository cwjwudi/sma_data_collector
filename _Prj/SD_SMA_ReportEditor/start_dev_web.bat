@echo off
chcp 65001 >nul
setlocal

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

if exist "%BACKEND%\venv\Scripts\python.exe" (
  set "PYEXE=%BACKEND%\venv\Scripts\python.exe"
) else (
  set "PYEXE=python"
)

echo [1/3] 启动后端 ^(127.0.0.1:8000^) ...
start "SD_SMA_ReportEditor - Backend" cmd /k cd /d "%BACKEND%" ^& "%PYEXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

timeout /t 2 /nobreak >nul

echo [2/3] 启动前端 ^(http://localhost:5173^) ...
start "SD_SMA_ReportEditor - Frontend" cmd /k cd /d "%FRONTEND%" ^& npm.cmd run dev

echo [3/3] 等待 Vite 就绪后打开浏览器 ...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173/"

echo.
echo 已在新窗口启动后端与前端；浏览器应已打开报表编辑器页面。
echo 关闭标题为 Backend / Frontend 的两个窗口即可停止服务。
echo.
pause
endlocal
