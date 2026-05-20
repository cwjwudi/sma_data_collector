@echo off
REM Shortcut -> packaging\windows\build.bat
call "%~dp0packaging\windows\build.bat" %*
exit /b %ERRORLEVEL%
