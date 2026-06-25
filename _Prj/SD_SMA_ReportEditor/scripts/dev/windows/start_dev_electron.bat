@echo off
setlocal
title SD_SMA_ReportEditor - Start dev (Electron)

rem ASCII-only; save UTF-8 without BOM - BOM breaks @echo off under cmd.exe.

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

if not exist "%BACKEND%\main.py" (
  echo [ERROR] Missing "%BACKEND%\main.py". Run this .bat from SD_SMA_ReportEditor repo root.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Missing "%FRONTEND%\package.json". Run this .bat from SD_SMA_ReportEditor repo root.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js LTS and add it to PATH.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node was not found. Install Node.js 20 or 22 LTS and add it to PATH.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

for /f "usebackq delims=" %%V in (`node -p "process.versions.node" 2^>nul`) do set "NODE_VERSION=%%V"
for /f "tokens=1 delims=." %%V in ("%NODE_VERSION%") do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo [ERROR] Could not detect Node.js version.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Unsupported Node.js %NODE_VERSION%.
  echo This project requires Node.js 20.x or 22.x LTS.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if %NODE_MAJOR% GEQ 24 (
  echo [ERROR] Unsupported Node.js %NODE_VERSION%.
  echo This project requires Node.js 20.x or 22.x LTS.
  echo Node 24 can leave Electron's binary install incomplete.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if not exist "%FRONTEND%\node_modules\.bin\electron.cmd" (
  echo [ERROR] Frontend dependencies are missing.
  echo Run scripts\dev\windows\install_and_start_dev_web.bat first, or run npm install in "%FRONTEND%".
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

set "ELECTRON_PACKAGE=%FRONTEND%\node_modules\electron"
set "ELECTRON_PATH_FILE=%ELECTRON_PACKAGE%\path.txt"
if not exist "%ELECTRON_PATH_FILE%" (
  echo [ERROR] Electron is not installed correctly.
  echo Missing "%ELECTRON_PATH_FILE%".
  echo Switch to Node.js 20 or 22 LTS, then run npm install in "%FRONTEND%".
  echo If npm reuses a bad cache, delete "%ELECTRON_PACKAGE%" first.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

set "ELECTRON_EXE_REL="
set /p ELECTRON_EXE_REL=<"%ELECTRON_PATH_FILE%"
if not defined ELECTRON_EXE_REL (
  echo [ERROR] Electron is not installed correctly.
  echo "%ELECTRON_PATH_FILE%" is empty.
  echo Switch to Node.js 20 or 22 LTS, then run npm install in "%FRONTEND%".
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if not exist "%ELECTRON_PACKAGE%\dist\%ELECTRON_EXE_REL%" (
  echo [ERROR] Electron is not installed correctly.
  echo Missing "%ELECTRON_PACKAGE%\dist\%ELECTRON_EXE_REL%".
  echo Switch to Node.js 20 or 22 LTS, then run npm install in "%FRONTEND%".
  echo If npm reuses a bad cache, delete "%ELECTRON_PACKAGE%" first.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

echo [1/2] Switching to frontend ...
cd /d "%FRONTEND%"

echo [2/2] Starting Electron dev shell ...
echo Electron will start Vite and spawn the backend on 127.0.0.1:8000.
echo Close this window or press Ctrl+C to stop the dev session.
echo.

npm run electron:dev

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Electron dev session exited with code %EXIT_CODE%.
echo Press any key to close this window.
pause >nul
exit /b %EXIT_CODE%
