@echo off
echo ========================================
echo   数据采集系统 - HTTP 服务快速启动
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请确保已安装 Python
    pause
    exit /b 1
)

echo [1/3] 启动 HTTP 测试服务器...
start "HTTP 测试服务器" cmd /k "python tests\test_http_server.py"

timeout /t 2 /nobreak >nul

echo [2/3] 启动数据采集系统...
start "数据采集系统" cmd /k "python main.py --config config\trend_config.json"

timeout /t 3 /nobreak >nul

echo [3/3] 打开监控页面...
echo.
echo ========================================
echo   请访问以下地址查看监控页面：
echo ========================================
echo.
echo   1. 新版监控页面（推荐）：
echo      http://localhost:8080/
echo.
echo   2. 旧版图表页面：
echo      需要先修改 js\line_http.html 的连接地址
echo.
echo ========================================
echo   按 Ctrl+C 停止所有服务
echo ========================================
echo.
pause
