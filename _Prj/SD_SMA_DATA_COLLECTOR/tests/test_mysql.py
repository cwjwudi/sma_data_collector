"""
数据库连接测试脚本
用于测试 MySQL/MariaDB 数据库连接
"""

import sys
import logging
from typing import Dict, Any

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_pymysql_connection(config: Dict[str, Any]) -> bool:
    """
    使用 pymysql 直接测试数据库连接
    
    Args:
        config: 数据库配置字典
        
    Returns:
        bool: 连接是否成功
    """
    try:
        import pymysql
        
        logger.info(f"尝试连接到 {config['type']} 数据库：{config['host']}:{config['port']}/{config['name']}")
        
        connection = pymysql.connect(
            host=config['host'],
            port=config['port'],
            user=config['username'],
            password=config['password'],
            database=config['name'],
            charset='utf8mb4',
            connect_timeout=10
        )
        
        logger.info("✓ pymysql 连接成功！")
        
        # 测试查询
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            logger.info(f"✓ 测试查询成功，结果：{result}")
            
            # 获取数据库版本信息
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            logger.info(f"✓ 数据库版本：{version[0]}")
        
        connection.close()
        logger.info("✓ 连接已关闭")
        return True
        
    except ImportError:
        logger.error("✗ pymysql 未安装，请运行：pip install pymysql")
        return False
    except Exception as e:
        logger.error(f"✗ 连接失败：{e}")
        return False


def test_sqlalchemy_connection(config: Dict[str, Any]) -> bool:
    """
    使用 SQLAlchemy 测试数据库连接（与主程序相同的方式）
    
    Args:
        config: 数据库配置字典
        
    Returns:
        bool: 连接是否成功
    """
    try:
        from sqlalchemy import create_engine, text
        from sqlalchemy.exc import SQLAlchemyError
        from urllib.parse import quote_plus
        
        logger.info(f"尝试通过 SQLAlchemy 连接：{config['host']}:{config['port']}/{config['name']}")
        
        # 对密码进行 URL 编码，避免特殊字符导致解析错误
        encoded_password = quote_plus(config['password'])
        
        # 构建连接字符串
        connection_string = (
            f"mysql+pymysql://{config['username']}:"
            f"{encoded_password}@"
            f"{config['host']}:{config['port']}/"
            f"{config['name']}?charset=utf8mb4"
        )
        
        logger.info(f"连接字符串：{connection_string}")
        
        engine = create_engine(
            connection_string,
            pool_pre_ping=True,
            echo=False
        )
        
        # 测试连接
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            logger.info(f"✓ SQLAlchemy 连接成功！查询结果：{result.fetchone()}")
            
            # 获取数据库版本
            result = conn.execute(text("SELECT VERSION()"))
            version = result.fetchone()
            logger.info(f"✓ 数据库版本：{version[0]}")
        
        engine.dispose()
        logger.info("✓ 引擎已关闭")
        return True
        
    except ImportError as e:
        logger.error(f"✗ SQLAlchemy 未安装：{e}")
        return False
    except SQLAlchemyError as e:
        logger.error(f"✗ SQLAlchemy 连接失败：{e}")
        return False
    except Exception as e:
        logger.error(f"✗ 未知错误：{e}")
        return False


def test_network_connectivity(config: Dict[str, Any]) -> bool:
    """
    测试网络连通性
    
    Args:
        config: 数据库配置字典
        
    Returns:
        bool: 是否可 ping 通
    """
    import socket
    
    try:
        logger.info(f"测试网络连通性：{config['host']}:{config['port']}")
        
        # 尝试解析主机名
        ip_address = socket.gethostbyname(config['host'])
        logger.info(f"✓ DNS 解析成功：{config['host']} -> {ip_address}")
        
        # 尝试建立 TCP 连接
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((ip_address, config['port']))
        sock.close()
        
        if result == 0:
            logger.info(f"✓ 端口 {config['port']} 可访问")
            return True
        else:
            logger.error(f"✗ 端口 {config['port']} 无法访问（错误码：{result}）")
            return False
            
    except socket.gaierror as e:
        logger.error(f"✗ DNS 解析失败：{e}")
        logger.error("提示：请检查 IP 地址是否正确，或尝试使用 IP 地址而非主机名")
        return False
    except Exception as e:
        logger.error(f"✗ 网络测试失败：{e}")
        return False


def load_config_from_file(config_path: str) -> Dict[str, Any]:
    """
    从 JSON 文件加载配置
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        数据库配置字典
    """
    import json
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
        
        db_config = config_data.get('database', {})
        logger.info(f"已从配置文件加载：{config_path}")
        return db_config
        
    except FileNotFoundError:
        logger.error(f"✗ 配置文件未找到：{config_path}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"✗ 配置文件格式错误：{e}")
        return None


def interactive_config() -> Dict[str, Any]:
    """
    交互式输入数据库配置
    
    Returns:
        数据库配置字典
    """
    print("\n=== 请输入数据库配置 ===")
    config = {
        'type': input("数据库类型 (mysql/mariadb) [mysql]: ").strip() or 'mysql',
        'host': input("主机地址 [127.0.0.1]: ").strip() or '127.0.0.1',
        'port': int(input("端口号 [3306]: ").strip() or '3306'),
        'name': input("数据库名: ").strip(),
        'username': input("用户名 [root]: ").strip() or 'root',
        'password': input("密码: ").strip()
    }
    return config


def main():
    """主函数"""
    print("=" * 60)
    print("数据库连接测试工具".center(60))
    print("=" * 60)
    
    # 获取配置
    config = None
    
    if len(sys.argv) > 1:
        # 从命令行参数读取配置文件
        config_path = sys.argv[1]
        config = load_config_from_file(config_path)
    else:
        # 尝试从默认配置文件加载
        default_configs = [
            'config/sample_config.json',
            '../config/sample_config.json',
            '../../config/sample_config.json'
        ]
        
        for default_config in default_configs:
            import os
            if os.path.exists(default_config):
                config = load_config_from_file(default_config)
                if config:
                    break
        
        # 如果都没有，使用交互式输入
        if not config:
            print("\n未找到配置文件，请使用以下方式：")
            print("1. 命令行指定配置文件：python test_db_connection.py <config.json>")
            print("2. 交互式输入配置")
            
            choice = input("\n选择方式 (1-配置文件 / 2-交互输入) [1]: ").strip() or '1'
            if choice == '2':
                config = interactive_config()
            else:
                config_path = input("请输入配置文件路径：").strip()
                config = load_config_from_file(config_path)
    
    if not config:
        print("\n✗ 未能获取数据库配置，退出测试")
        sys.exit(1)
    
    # 打印配置信息（隐藏密码）
    print("\n" + "=" * 60)
    print("配置信息".center(60))
    print("=" * 60)
    print(f"数据库类型：{config.get('type', 'mysql')}")
    print(f"主机地址：{config['host']}:{config['port']}")
    print(f"数据库名：{config['name']}")
    print(f"用户名：{config['username']}")
    print(f"密码：{'*' * len(config.get('password', ''))}")
    print("=" * 60 + "\n")
    
    # 执行测试
    results = {}
    
    # 1. 网络连通性测试
    print("\n[1/3] 网络连通性测试")
    print("-" * 60)
    results['network'] = test_network_connectivity(config)
    
    # 2. pymysql 直接连接测试
    print("\n[2/3] PyMySQL 连接测试")
    print("-" * 60)
    results['pymysql'] = test_pymysql_connection(config)
    
    # 3. SQLAlchemy 连接测试
    print("\n[3/3] SQLAlchemy 连接测试（主程序使用方式）")
    print("-" * 60)
    results['sqlalchemy'] = test_sqlalchemy_connection(config)
    
    # 测试结果汇总
    print("\n" + "=" * 60)
    print("测试结果汇总".center(60))
    print("=" * 60)
    print(f"网络连通性：{'✓ 通过' if results['network'] else '✗ 失败'}")
    print(f"PyMySQL 连接：{'✓ 通过' if results['pymysql'] else '✗ 失败'}")
    print(f"SQLAlchemy 连接：{'✓ 通过' if results['sqlalchemy'] else '✗ 失败'}")
    print("=" * 60)
    
    if all(results.values()):
        print("\n✓ 所有测试通过！数据库连接正常。")
        sys.exit(0)
    else:
        print("\n✗ 部分测试失败，请检查上述错误信息。")
        sys.exit(1)


if __name__ == "__main__":
    main()