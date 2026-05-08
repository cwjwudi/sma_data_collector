@echo off
setlocal

rem 控制台使用 GBK(936)，与批处理文件编码一致
chcp 936 >nul 2>&1

cd /d "%~dp0"

set "DEFAULT_CONFIG=config\sample_config.json"

if /I "%~1"=="collector" goto collector
if /I "%~1"=="web" goto web
if /I "%~1"=="all" goto all

echo ========================================
echo   SD_SMA_DATA_COLLECTOR 统一启动脚本
echo ========================================
echo.
echo 1. 启动数据采集主程序
echo 2. 启动配置网页
echo 3. 同时启动（网页 + 采集）
echo.
choice /C 123 /N /M "请选择启动模式(1/2/3): "
if errorlevel 3 goto all
if errorlevel 2 goto web
if errorlevel 1 goto collector

:collector
set "CONFIG=%~2"
if "%CONFIG%"=="" set "CONFIG=%DEFAULT_CONFIG%"
echo [Collector] 使用配置: %CONFIG%
python main.py --config "%CONFIG%"
goto end

:web
echo [Web] 启动配置网页: http://localhost:8091
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
goto end

:all
echo [All] 先启动配置网页，再启动采集主程序
rem START /D sets workdir; avoids cmd /k nested-quote path errors
start "SD_SMA Config Web" /D "%~dp0" cmd /k python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
timeout /t 1 /nobreak >nul
echo [Collector] 使用配置: %DEFAULT_CONFIG%
python main.py --config "%DEFAULT_CONFIG%"
goto end

:end
pause
endlocal
