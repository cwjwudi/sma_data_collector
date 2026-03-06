#!/bin/bash
# BR数据采集系统启动脚本

# 设置环境变量
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# 检查配置文件
CONFIG_FILE="config/sample_config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "错误: 配置文件 $CONFIG_FILE 不存在"
    echo "请先创建配置文件或复制 sample_config.json"
    exit 1
fi

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3"
    exit 1
fi

# 检查依赖
if [ ! -f "requirements.txt" ]; then
    echo "警告: requirements.txt 文件不存在"
else
    echo "检查Python依赖..."
    python3 -c "import opcua, sqlalchemy" 2>/dev/null || {
        echo "安装依赖包..."
        pip install -r requirements.txt
    }
fi

# 创建必要目录
mkdir -p logs data output

echo "启动BR数据采集系统..."
echo "配置文件: $CONFIG_FILE"
echo "日志文件: data_collector.log"
echo "按 Ctrl+C 停止系统"

# 启动系统
python3 main.py --config "$CONFIG_FILE"