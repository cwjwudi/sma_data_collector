"""
数据采集系统主应用程序
整合配置、通信、数据库各模块，提供完整的数据采集解决方案
"""

import asyncio
import logging
from nt import system
import signal
import sys
from typing import Optional
from datetime import datetime

# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from core.config_loader import ConfigLoader
    from core.config_models import AppConfig
    from communication.opcua_client import OpcUaClient
    from communication.data_collector import DataCollector
    from communication.communication_manager import CommunicationManager
    from communication.opcua_data_writer import OpcUaDataWriter
    from database.db_manager import DatabaseManager
    from database.data_storage import DataStorageProcessor
    from database.data_query import DataQueryProcessor
except ImportError as e:
    print(f"导入模块时发生错误: {e}")
    print("请确保所有依赖包已正确安装")
    sys.exit(1)

# 禁止 opcua 的 info/debug 日志
logging.getLogger("opcua").setLevel(logging.WARNING)

class DataCollectionSystem:
    """数据采集系统主类"""
    
    def __init__(self, config_file: str):
        """
        初始化数据采集系统
        
        Args:
            config_file: 配置文件路径
        """
        self.config_file = config_file
        self.config: Optional[AppConfig] = None
        self.communication_manager: Optional[CommunicationManager] = None
        self.data_collector: Optional[DataCollector] = None
        self.db_manager: Optional[DatabaseManager] = None
        self.storage_processor: Optional[DataStorageProcessor] = None
        self.query_processor: Optional[DataQueryProcessor] = None
        self.query_task_processor: Optional[asyncio.Task] = None  # 查询任务处理任务
        self.running = False
        self.setup_logging()
    
    def setup_logging(self) -> None:
        """设置日志配置"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('data_collector.log', encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    async def initialize(self) -> bool:
        """
        初始化系统各组件
        
        Returns:
            bool: 初始化是否成功
        """
        try:
            # 加载配置
            self.logger.info("正在加载配置...")
            self.config = ConfigLoader.load_from_file(self.config_file)
            
            # 初始化通信管理器
            self.logger.info("正在初始化通信管理器...")
            self.communication_manager = CommunicationManager(self.config)
            if not await self.communication_manager.initialize_connections():
                self.logger.error("通信管理器初始化失败")
                return False
            
            # 构建group配置字典
            group_configs = {}
            for group in self.config.groups:
                group_configs[group.name] = {
                    'recreate_interval_days': group.recreate_interval_days,
                    'batch_insert_size': group.batch_insert_size
                }
            
            # 初始化数据库管理器
            self.logger.info("正在初始化数据库...")
            self.db_manager = DatabaseManager({
                'type': self.config.database.type,
                'name': self.config.database.name,
                'host': self.config.database.host,
                'port': self.config.database.port,
                'username': self.config.database.username,
                'password': self.config.database.password
            }, group_configs)
            
            if not self.db_manager.connect():
                self.logger.error("数据库连接失败")
                return False
            
            # 初始化数据存储处理器（使用第一个group的batch_insert_size作为默认值）
            default_batch_size = 10
            if self.config.groups:
                default_batch_size = self.config.groups[0].batch_insert_size
            
            self.storage_processor = DataStorageProcessor(
                self.db_manager,
                default_batch_size
            )
            
            # 为每个数据组设置对应的batch_size
            for group in self.config.groups:
                self.storage_processor.group_batch_sizes[group.name] = group.batch_insert_size
                self.logger.debug(f"设置组 {group.name} 的batch_size为 {group.batch_insert_size}")
            
            # 初始化数据查询处理器
            self.query_processor = DataQueryProcessor(self.db_manager)
            
            # 初始化数据采集器
            self.data_collector = DataCollector(self.communication_manager)
            self.data_collector.register_data_callback(self._on_data_received)
            
            self.logger.info("系统初始化完成")
            return True
            
        except Exception as e:
            self.logger.error(f"系统初始化失败: {e}")
            return False
    
    def _on_data_received(self, collection_data: dict) -> None:
        """
        数据接收回调函数
        
        Args:
            collection_data: 采集到的数据
        """
        if self.storage_processor:
            self.storage_processor.add_data(collection_data)
            self.logger.debug(f"接收到数据: 组名={collection_data['group_name']}, "
                            f"触发类型={collection_data['trigger_type']}")
    
    async def start(self) -> None:
        """启动数据采集系统"""
        if not self.config or not self.data_collector:
            raise RuntimeError("系统未初始化")
        
        try:
            self.running = True
            
            # 启动数据存储处理器
            await self.storage_processor.start_processing()
            
            # 启动查询任务处理器
            self.query_task_processor = asyncio.create_task(
                self._process_query_tasks(),
                name="query_task_processor"
            )
            self.logger.info("查询任务处理器已启动")
            
            # 创建数据点字典以便快速查找
            data_points_dict = {point.name: point for point in self.config.points}
            
            # 启动数据采集 - 支持多个数据组
            target_group_names = self.config.database.data_groups
            if not target_group_names:
                raise ValueError("数据库配置中未指定任何数据组")
            
            target_groups = [g for g in self.config.groups if g.name in target_group_names]
            
            if len(target_groups) != len(target_group_names):
                missing_groups = set(target_group_names) - set(g.name for g in target_groups)
                raise ValueError(f"未找到指定的数据组: {missing_groups}")
            
            self.logger.info(f"启动数据采集，目标数据组: {[g.name for g in target_groups]}")
            await self.data_collector.start_collection(target_groups, data_points_dict)
            
            self.logger.info("数据采集系统已启动")
            
            # 等待中断信号
            await self._wait_for_shutdown()
            
        except Exception as e:
            self.logger.error(f"启动系统时发生错误: {e}")
            raise
    
    async def stop(self) -> None:
        """停止数据采集系统"""
        self.logger.info("正在停止数据采集系统...")
        self.running = False
        
        try:
            # 停止数据采集
            if self.data_collector:
                await self.data_collector.stop_collection()
        except Exception as e:
            self.logger.error(f"停止数据采集器时发生错误：{e}")
                
        try:
            # 停止查询任务处理器
            if self.query_task_processor:
                self.query_task_processor.cancel()
                try:
                    await self.query_task_processor
                except asyncio.CancelledError:
                    self.logger.info("查询任务处理器已停止")
        except Exception as e:
            self.logger.error(f"停止查询任务处理器时发生错误：{e}")
        
        try:
            # 停止数据存储处理器
            if self.storage_processor:
                await self.storage_processor.stop_processing()
        except Exception as e:
            self.logger.error(f"停止数据存储处理器时发生错误: {e}")
        
        try:
            # 断开所有通信连接
            if self.communication_manager:
                await self.communication_manager.disconnect_all()
        except Exception as e:
            self.logger.error(f"断开OPC UA连接时发生错误: {e}")
        
        try:
            # 断开数据库连接
            if self.db_manager:
                self.db_manager.disconnect()
        except Exception as e:
            self.logger.error(f"断开数据库连接时发生错误: {e}")
        
        self.logger.info("数据采集系统已停止")
    
    async def _wait_for_shutdown(self) -> None:
        """等待关闭信号"""
        # 在Windows上不支持信号处理，使用轮询方式检查
        try:
            while self.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            # 捕获Ctrl+C中断
            await self.stop()
    
    def query_data(self, 
                   start_time: datetime,
                   end_time: datetime,
                   point_names: list,
                   output_file: str) -> bool:
        """
        查询历史数据
        
        Args:
            start_time: 开始时间
            end_time: 结束时间
            point_names: 数据点名称列表
            output_file: 输出文件路径
            
        Returns:
            bool: 查询是否成功
        """
        if not self.query_processor:
            raise RuntimeError("查询处理器未初始化")
        
        return self.query_processor.query_data(
            start_time, end_time, point_names, output_file
        )
    
    def get_available_points(self) -> list:
        """
        获取可用的数据点
        
        Returns:
            list: 数据点名称列表
        """
        if not self.query_processor:
            raise RuntimeError("查询处理器未初始化")
        
        return self.query_processor.get_available_points()
    
    async def _process_query_tasks(self) -> None:
        """
        处理查询任务队列中的任务
        
        从 DataCollector 的 query_task_queue 中获取查询任务，
        执行查询并将结果写入 OPC UA 缓冲区
        """
        self.logger.info("查询任务处理器开始运行")
        
        while self.running:
            try:
                # 从队列中获取查询任务（阻塞直到有任务）
                query_task = await asyncio.wait_for(
                    self.data_collector.query_task_queue.get(),
                    timeout=1.0
                )
                
                self.logger.info(f"开始处理查询任务：{query_task['group_name']}")
                
                # 获取查询组的配置
                query_group_config = None
                for group in self.config.groups:
                    if group.name == query_task['group_name']:
                        query_group_config = group
                        break
                
                # 执行数据库查询
                query_results, query_time = self.query_processor.query_data(
                    start_times=query_task['start_time'],
                    end_times=query_task['end_time'],
                    point_names=query_task['point_names'],
                    group_names=query_task['group_names'],
                    output_file=query_task.get('output_file'),
                    return_data=True
                )
                
                if query_results is None:
                    self.logger.error(f"查询任务失败：{query_task['group_name']}")
                else:             
                    # 使用查询任务中的 opcua_client 创建写入器，并传入组配置
                    opcua_client = query_task['opcua_client']
                    data_writer = OpcUaDataWriter(opcua_client, query_group_config)
                    
                    # 将查询结果写入 OPC UA 缓冲区
                    success = await data_writer.write_query_results(
                        query_results,
                        query_time,
                        query_task['point_names']
                    )
                    
                    if success:
                        self.logger.info(f"查询结果已成功写入 OPC UA 缓冲区：{query_task['group_name']}")
                    else:
                        self.logger.warning(f"写入 OPC UA 缓冲区失败：{query_task['group_name']}")
                
                # 标记任务完成
                self.data_collector.query_task_queue.task_done()
                
            except asyncio.TimeoutError:
                # 队列为空，继续等待
                continue
            except asyncio.CancelledError:
                self.logger.info("查询任务处理器被取消")
                break
            except Exception as e:
                self.logger.error(f"处理查询任务时发生错误：{e}", exc_info=True)
                await asyncio.sleep(1)


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='BR数据采集系统')
    parser.add_argument('--config', '-c', default='config/Alarm_Audit.json',
                       help='配置文件路径')
    parser.add_argument('--query', '-q', action='store_true',
                       help='进入查询模式')
    
    args = parser.parse_args()
    
    if args.query:
        # 查询模式
        run_query_mode(args.config)
    else:
        # 采集模式
        asyncio.run(run_collection_mode(args.config))


async def run_collection_mode(config_file: str):
    """运行采集模式"""
    system = DataCollectionSystem(config_file)
    
    try:
        if await system.initialize():
            await system.start()
        else:
            print("系统初始化失败")
    except KeyboardInterrupt:
        print("\n收到中断信号，正在停止系统...")
    except Exception as e:
        print(f"系统运行错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            # 在finally块中也要处理可能的异常
            await system.stop()
        except Exception as e:
            print(f"停止系统时发生错误: {e}")


def run_query_mode(config_file: str):
    """运行查询模式"""
    system = DataCollectionSystem(config_file)
    
    try:
        # 初始化系统（只需要查询相关组件）
        if not asyncio.run(system.initialize()):
            print("系统初始化失败")
            return
        
        # 显示可用数据点
        points = system.get_available_points()
        print("可用数据点:")
        for i, point in enumerate(points, 1):
            print(f"{i}. {point}")
        
        if not points:
            print("没有可用的数据点")
            return
        
        # 获取用户输入
        print("\n请输入查询参数:")
        start_time_str = input("开始时间 (YYYY-MM-DD HH:MM:SS): ")
        end_time_str = input("结束时间 (YYYY-MM-DD HH:MM:SS): ")
        output_file = input("输出文件路径 (如: output.csv): ")
        
        # 解析时间
        start_time = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        end_time = datetime.strptime(end_time_str, "%Y-%m-%d %H:%M:%S")
        
        # 执行查询
        if system.query_data(start_time, end_time, points, output_file):
            print(f"数据查询成功，已保存到: {output_file}")
        else:
            print("数据查询失败")
            
    except KeyboardInterrupt:
        print("\n查询被中断")
    except Exception as e:
        print(f"查询过程中发生错误: {e}")
    finally:
        asyncio.run(system.stop())


if __name__ == "__main__":
    main()