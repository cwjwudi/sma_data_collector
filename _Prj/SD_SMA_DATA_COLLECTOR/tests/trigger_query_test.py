"""
测试脚本：触发查询任务
用于手动触发数据库查询，从而测试 HTTP 发送功能
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from communication.opcua_client import OpcUaClient
from core.config_models import DataPoint


async def trigger_query():
    """触发查询任务"""
    print("=" * 60)
    print("  触发查询任务 - 测试 HTTP 发送功能")
    print("=" * 60)
    
    # 创建 OPC UA 客户端
    client = OpcUaClient("opc.tcp://127.0.0.1:4840")
    
    try:
        # 连接到 OPC UA 服务器
        print("\n正在连接到 OPC UA 服务器...")
        await client.connect()
        print("✓ 连接成功\n")
        
        # 定义数据点
        trigger_point = DataPoint(
            name="bTriggerQuery",
            path="ns=6;s=::Trend:bExecuteRead",
            description="触发查询"
        )
        
        start_time_point = DataPoint(
            name="strStartTimes",
            path="ns=6;s=::Trend:stDbReadQuery.stConfig.strStartTimes",
            description="起始时间"
        )
        
        end_time_point = DataPoint(
            name="strEndTimes",
            path="ns=6;s=::Trend:stDbReadQuery.stConfig.strEndTimes",
            description="结束时间"
        )
        
        point_names_point = DataPoint(
            name="strPointNames",
            path="ns=6;s=::Trend:stDbReadQuery.stConfig.strPointNames",
            description="数据点名称"
        )
        
        # 设置查询参数（查询最近 5 分钟的数据）
        now = datetime.now()
        five_minutes_ago = now - timedelta(minutes=5)
        
        start_time_str = five_minutes_ago.strftime("%Y-%m-%d %H:%M:%S")
        end_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
        point_names_str = "Trenddata"
        
        print(f"设置查询参数:")
        print(f"  起始时间：{start_time_str}")
        print(f"  结束时间：{end_time_str}")
        print(f"  数据点：{point_names_str}")
        print()
        
        # 写入查询参数
        print("正在写入查询参数...")
        await client.write_value(start_time_point, start_time_str)
        await client.write_value(end_time_point, end_time_str)
        await client.write_value(point_names_point, point_names_str)
        print("✓ 参数写入成功\n")
        
        # 等待一下
        await asyncio.sleep(1)
        
        # 触发查询（上升沿）
        print("正在触发查询（置 bTriggerQuery = True）...")
        await client.write_value(trigger_point, True)
        print("✓ 触发信号已发送\n")
        
        print("等待查询执行...")
        await asyncio.sleep(3)
        
        # 复位触发信号
        print("正在复位触发信号（置 bTriggerQuery = False）...")
        await client.write_value(trigger_point, False)
        print("✓ 触发信号已复位\n")
        
        print("=" * 60)
        print("✓ 查询任务已触发")
        print("=" * 60)
        print()
        print("请查看:")
        print("  1. 数据采集系统控制台 - 应该显示查询执行日志")
        print("  2. HTTP 服务器控制台 - 应该显示接收到数据的日志")
        print("  3. 前端页面 - 应该显示最新数据")
        print()
        
    except Exception as e:
        print(f"\n❌ 错误：{e}")
        import traceback
        traceback.print_exc()
    finally:
        # 断开连接
        try:
            await client.disconnect()
            print("已断开 OPC UA 连接")
        except:
            pass


if __name__ == "__main__":
    asyncio.run(trigger_query())
