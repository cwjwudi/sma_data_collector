@echo off
setlocal
set SCRIPT=%~dp0fix_docker_wsl2_admin.ps1
echo.
echo == 将弹出 UAC：请点「是」以管理员启用 WSL2 / 虚拟机平台 ==
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"'%SCRIPT%'\"'"
echo.
echo 若已点「是」，请等待管理员窗口跑完，然后【重启电脑】，再开 Docker Desktop。
echo 日志一般在: %%TEMP%%\fix-docker-wsl2.log
pause
