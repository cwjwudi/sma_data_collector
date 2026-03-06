"""
系统初始化脚本
用于初始化系统环境和依赖
"""

import os
import subprocess
import sys


def install_dependencies():
    """安装项目依赖"""
    print("正在安装项目依赖...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("依赖安装完成!")
    except subprocess.CalledProcessError as e:
        print(f"依赖安装失败: {e}")
        return False
    return True


def create_directories():
    """创建必要的目录"""
    dirs = ["logs", "data", "output"]
    for dir_name in dirs:
        if not os.path.exists(dir_name):
            os.makedirs(dir_name)
            print(f"创建目录: {dir_name}")


def main():
    """主初始化函数"""
    print("=== BR数据采集系统初始化 ===")
    
    # 安装依赖
    if not install_dependencies():
        return False
    
    # 创建目录
    create_directories()
    
    print("系统初始化完成!")
    print("\n使用说明:")
    print("1. 修改 config/sample_config.json 中的配置")
    print("2. 运行采集模式: python main.py")
    print("3. 运行查询模式: python main.py --query")
    
    return True


if __name__ == "__main__":
    main()