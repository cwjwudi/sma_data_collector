@echo off
echo ========================================
echo   SD_SMA_DATA_COLLECTOR 配置网页启动
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 安装配置网页依赖...
python -m pip install -r web_config\requirements.txt
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

echo [2/2] 启动配置网页 (http://localhost:8091)...
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091

pause

