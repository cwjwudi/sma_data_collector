@echo off
setlocal
title SD_SMA_ReportEditor - Start dev (Electron, Node 22)

rem Uses a project-specific Node.js runtime without changing the system PATH.
rem Keep this file ASCII-only; UTF-8 BOM can break @echo off under cmd.exe.

set "SCRIPT_DIR=%~dp0"
set "NODE_HOME=C:\Users\BR\.env\node-v22.23.1-win-x64"
set "ENTRY=%SCRIPT_DIR%start_dev_electron.bat"

if not exist "%NODE_HOME%\node.exe" (
  echo [ERROR] Missing "%NODE_HOME%\node.exe".
  echo Check NODE_HOME in this script.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if not exist "%NODE_HOME%\npm.cmd" (
  echo [ERROR] Missing "%NODE_HOME%\npm.cmd".
  echo Check NODE_HOME in this script.
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

if not exist "%ENTRY%" (
  echo [ERROR] Missing "%ENTRY%".
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

set "PATH=%NODE_HOME%;%PATH%"

echo Using project Node.js:
where node
node --version
echo.
echo Using project npm:
where npm
call npm.cmd --version
echo.

call "%ENTRY%"
exit /b %ERRORLEVEL%
