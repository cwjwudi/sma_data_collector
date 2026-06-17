@echo off
setlocal

rem Convenience entrypoint from scripts\dev\. The Windows implementation lives
rem under scripts\dev\windows\ to match the existing dev script layout.

set "SCRIPT_DIR=%~dp0"
set "WINDOWS_ENTRY=%SCRIPT_DIR%windows\start_dev_electron.bat"

if not exist "%WINDOWS_ENTRY%" (
  echo [ERROR] Missing "%WINDOWS_ENTRY%".
  echo This window will close in about 30 seconds.
  ping 127.0.0.1 -n 31 >nul
  exit /b 1
)

call "%WINDOWS_ENTRY%"
exit /b %ERRORLEVEL%
