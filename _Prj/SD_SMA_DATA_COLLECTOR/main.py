"""
数据采集系统主应用程序
整合配置、通信、数据库各模块，提供完整的数据采集解决方案
"""

import asyncio
import logging
from logging.handlers import TimedRotatingFileHandler
from nt import system
import signal
import sys
import re
from typing import Optional
from datetime import datetime
from aiohttp import web
from concurrent.futures import ThreadPoolExecutor

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
    from communication.http_client import HttpClient
    from communication.heartbeat_manager import HeartbeatManager
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
    
    @staticmethod
    def _rotated_log_namer(default_name: str) -> str:
        """
        将轮转文件名从 data_collector.log.YYYY-MM-DD
        转换为 data_collector.YYYY-MM-DD.log
        """
        match = re.match(r"^(?P<prefix>.+)\.log\.(?P<suffix>.+)$", default_name)
        if not match:
            return default_name
        return f"{match.group('prefix')}.{match.group('suffix')}.log"

    def __init__(self, config_file: str):
        """
        初始化数据采集系统
        
        Args:
            config_file: 配置文件路径
        """
        self.config_file = config_file
        self.config: Optional[AppConfig] = None
        self.communication_manager: Optional[CommunicationManager] = None
        self.heartbeat_manager: Optional[HeartbeatManager] = None  # 心跳管理器
        self.data_collector: Optional[DataCollector] = None
        self.db_manager: Optional[DatabaseManager] = None
        self.storage_processor: Optional[DataStorageProcessor] = None
        self.query_processor: Optional[DataQueryProcessor] = None
        self.query_task_processor: Optional[asyncio.Task] = None  # 查询任务处理任务
        self.http_client: Optional[HttpClient] = None  # HTTP 客户端
        self.http_server: Optional[web.Application] = None  # HTTP 服务器
        self.http_server_runner: Optional[web.AppRunner] = None  # HTTP 服务器运行器
        self.running = False
        self.executor = ThreadPoolExecutor(max_workers=5)  # 创建线程池，最多 5 个工作线程
        self.setup_logging()
    
    def setup_logging(self) -> None:
        """设置日志配置"""
        configured_level = None
        if self.config and getattr(self.config, "logging", None):
            configured_level = getattr(self.config.logging, "level", None)
        log_level_name = (configured_level or os.getenv("SD_SMA_LOG_LEVEL", "INFO")).upper()
        log_level = getattr(logging, log_level_name, logging.INFO)
        log_file = self._get_log_file_path()
        rotation_when, rotation_interval, backup_days, console_enabled = self._get_log_rotation_settings()
        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - '
            '[pid=%(process)d tid=%(threadName)s] %(message)s'
        )
        file_handler = TimedRotatingFileHandler(
            filename=log_file,
            when=rotation_when,
            interval=rotation_interval,
            backupCount=backup_days,
            encoding="utf-8",
        )
        file_handler.namer = self._rotated_log_namer
        file_handler.setFormatter(formatter)
        file_handler.setLevel(log_level)

        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)
        root_logger.handlers.clear()
        root_logger.addHandler(file_handler)
        if console_enabled:
            stream_handler = logging.StreamHandler(sys.stdout)
            stream_handler.setFormatter(formatter)
            stream_handler.setLevel(log_level)
            root_logger.addHandler(stream_handler)

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
            # 配置加载后按配置重建日志输出目录
            self.setup_logging()
            self.logger.info("日志目录: %s", os.path.abspath(os.path.dirname(self._get_log_file_path())))
            
            # 初始化通信管理器
            self.logger.info("正在初始化通信管理器...")
            self.communication_manager = CommunicationManager(self.config)
            if not await self.communication_manager.initialize_connections():
                self.logger.error("通信管理器初始化失败")
                return False
            
            # 初始化心跳管理器
            self.logger.info("正在初始化心跳管理器...")
            self.heartbeat_manager = HeartbeatManager(self.config, self.communication_manager)
            
            # 构建 group 配置字典
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
            
            # 构建数据点字典，用于传递 datatype 信息
            points_dict = {point.name: point for point in self.config.points}
            
            self.storage_processor = DataStorageProcessor(
                self.db_manager,
                default_batch_size,
                points_dict,  # 传递数据点配置
                self._write_insert_feedback
            )
            
            # 为每个数据组设置对应的batch_size
            for group in self.config.groups:
                self.storage_processor.group_batch_sizes[group.name] = group.batch_insert_size
                self.storage_processor.group_unique_key_points[group.name] = group.unique_key_point
                if group.insert_feedback:
                    feedback_point_name = group.insert_feedback.feedback_point
                    feedback_point_path = points_dict[feedback_point_name].path
                    self.storage_processor.group_insert_feedback_configs[group.name] = {
                        "feedback_point_name": feedback_point_name,
                        "feedback_point": feedback_point_path,
                        "code_success": group.insert_feedback.code_success,
                        "code_unique_conflict": group.insert_feedback.code_unique_conflict,
                        "code_db_error": group.insert_feedback.code_db_error,
                        "code_other_error": group.insert_feedback.code_other_error,
                    }
                self.logger.debug(f"设置组 {group.name} 的batch_size为 {group.batch_insert_size}")
            
            # 初始化数据查询处理器
            self.query_processor = DataQueryProcessor(self.db_manager)
            
            # 初始化 HTTP 客户端和服务器（如果配置了 HTTP 服务器）
            http_config = getattr(self.config, 'http_server', None)
            if http_config and getattr(http_config, 'enabled', False):
                self.logger.info("正在初始化 HTTP 客户端和服务器...")
                
                # 初始化 HTTP 客户端
                self.http_client = HttpClient(
                    base_url=getattr(http_config, 'base_url', 'http://localhost:8080'),
                    endpoint=getattr(http_config, 'endpoint', '/api/data'),
                    timeout=getattr(http_config, 'timeout', 30),
                    max_retries=getattr(http_config, 'max_retries', 3),
                    retry_delay=getattr(http_config, 'retry_delay', 1.0)
                )
                self.logger.info(f"HTTP 客户端已配置：{self.http_client.full_url}")
                
                # 初始化 HTTP 服务器
                await self._init_http_server(http_config)
            else:
                self.logger.info("未启用 HTTP 服务器功能")
                self.http_client = None
            
            # 初始化数据采集器
            self.data_collector = DataCollector(self.communication_manager)
            self.data_collector.register_data_callback(self._on_data_received)
            
            self.logger.info("系统初始化完成")
            return True
            
        except Exception as e:
            self.logger.error(f"系统初始化失败: {e}", exc_info=True)
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
            
            # 启动心跳信号
            if self.heartbeat_manager:
                await self.heartbeat_manager.start_heartbeats()
            
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
                raise ValueError(f"未找到指定的数据组：{missing_groups}")
                        
            self.logger.info(f"启动数据采集，目标数据组：{[g.name for g in target_groups]}")
            await self.data_collector.start_collection(target_groups, data_points_dict)
                        
            # 启动 HTTP 服务器（如果已初始化）
            if self.http_server_runner:
                await self._start_http_server()
                        
            self.logger.info("数据采集系统已启动")
            
            # 等待中断信号
            await self._wait_for_shutdown()
            
        except Exception as e:
            self.logger.error(f"启动系统时发生错误: {e}", exc_info=True)
            raise
    
    async def stop(self) -> None:
        """停止数据采集系统"""
        self.logger.info("正在停止数据采集系统...")
        self.running = False
        
        try:
            # 停止心跳信号
            if self.heartbeat_manager:
                await self.heartbeat_manager.stop_heartbeats()
        except Exception as e:
            self.logger.error(f"停止心跳管理器时发生错误：{e}", exc_info=True)
        
        try:
            # 停止数据采集
            if self.data_collector:
                await self.data_collector.stop_collection()
        except Exception as e:
            self.logger.error(f"停止数据采集器时发生错误：{e}", exc_info=True)
                
        try:
            # 停止查询任务处理器
            if self.query_task_processor:
                self.query_task_processor.cancel()
                try:
                    await self.query_task_processor
                except asyncio.CancelledError:
                    self.logger.info("查询任务处理器已停止")
        except Exception as e:
            self.logger.error(f"停止查询任务处理器时发生错误：{e}", exc_info=True)
        
        try:
            # 停止数据存储处理器
            if self.storage_processor:
                await self.storage_processor.stop_processing()
        except Exception as e:
            self.logger.error(f"停止数据存储处理器时发生错误: {e}", exc_info=True)
        
        try:
            # 断开所有通信连接
            if self.communication_manager:
                await self.communication_manager.disconnect_all()
        except Exception as e:
            self.logger.error(f"断开OPC UA连接时发生错误: {e}", exc_info=True)
        
        try:
            # 断开数据库连接
            if self.db_manager:
                self.db_manager.disconnect()
        except Exception as e:
            self.logger.error(f"断开数据库连接时发生错误：{e}", exc_info=True)
                
        try:
            # 关闭 HTTP 客户端
            if self.http_client:
                await self.http_client.close()
                self.logger.info("HTTP 客户端已关闭")
        except Exception as e:
            self.logger.error(f"关闭 HTTP 客户端时发生错误：{e}", exc_info=True)
                
        try:
            # 停止 HTTP 服务器
            if self.http_server_runner:
                await self.http_server_runner.cleanup()
                self.logger.info("HTTP 服务器已停止")
        except Exception as e:
            self.logger.error(f"停止 HTTP 服务器时发生错误：{e}", exc_info=True)
                
        
        # 关闭线程池
        if hasattr(self, 'executor') and self.executor:
            self.executor.shutdown(wait=True)
            self.logger.info("线程池已关闭")
        
        self.logger.info("数据采集系统已停止")
    
    async def _wait_for_shutdown(self) -> None:
        """等待关闭信号"""
        # 在Windows上不支持信号处理，使用轮询方式检查
        try:
            while self.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            # 交由外层统一执行 stop()，避免重复关闭
            self.logger.info("收到 KeyboardInterrupt，准备关闭系统...")
        except asyncio.CancelledError:
            # Python 3.12 下 Ctrl+C 常表现为主协程取消
            self.logger.info("收到取消信号，准备关闭系统...")
    
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
    
    async def _write_query_status(self, opcua_client, query_group_config, status: int) -> bool:
        """
        写入查询状态到 OPC UA 反馈点
        
        Args:
            opcua_client: OPC UA 客户端实例
            query_group_config: 查询组配置对象
            status: 状态码
            
        Returns:
            bool: 写入是否成功
        """
        try:
            # 检查是否配置了反馈点
            if not query_group_config or not query_group_config.get_feed_back_point():
                self.logger.debug("未配置反馈点，跳过状态写入")
                return True
            
            # 创建数据写入器
            data_writer = OpcUaDataWriter(
                opcua_client, 
                query_group_config, 
                self.http_client
            )
            
            # 写入状态
            success = await data_writer._write_feed_back_status(status)
            
            return success
            
        except Exception as e:
            self.logger.error(f"写入查询状态失败：{e}", exc_info=True)
            return False

    async def _write_insert_feedback(self, group_name: str, feedback_point: str, status_code: int) -> bool:
        """
        写入采集插入反馈（UDINT）
        """
        try:
            if not self.communication_manager:
                self.logger.warning("通信管理器未初始化，无法写入插入反馈")
                return False

            opcua_client = self.communication_manager.get_client_for_group(group_name)
            if not opcua_client:
                self.logger.warning(f"组 {group_name} 未找到对应通信客户端，无法写入反馈")
                return False

            data_writer = OpcUaDataWriter(opcua_client, None, self.http_client)
            success = await data_writer.write_udint_feedback(feedback_point, status_code)
            if success:
                self.logger.debug(
                    f"组 {group_name} 已写入插入反馈: point={feedback_point}, code={status_code}"
                )
            else:
                self.logger.warning(
                    f"组 {group_name} 写入插入反馈失败: point={feedback_point}, code={status_code}"
                )
            return success
        except Exception as e:
            self.logger.error(
                f"组 {group_name} 写入插入反馈异常: {e}",
                exc_info=True
            )
            return False
    
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
                
                # 写入查询状态：正在查询
                await self._write_query_status(
                    query_task['opcua_client'],
                    query_group_config,
                    OpcUaDataWriter.QUERY_STATUS_RUNNING
                )
                
                # 在线程池中执行数据库查询，避免阻塞主事件循环
                loop = asyncio.get_event_loop()
                query_results, query_time, data_len = await loop.run_in_executor(
                    self.executor,
                    lambda: self.query_processor.query_data(
                        start_times=query_task['start_time'],
                        end_times=query_task['end_time'],
                        point_names=query_task['point_names'],
                        group_names=query_task['group_names'],
                        output_file=query_task.get('output_file'),
                        return_data=True,
                        by_what_time=query_task.get('by_what_time'),  # 支持自定义时间字段查询
                        aux_queries=query_task.get('aux_queries')  # 支持附加查询条件
                    )
                )

                if query_results is None:
                    self.logger.error(f"查询任务失败：{query_task['group_name']}")
                    # 写入错误状态（如果配置了反馈点）
                    await self._write_query_status(
                        query_task['opcua_client'],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_ERROR
                    )
                elif data_len == 0:
                    self.logger.warning(f"查询结果为空：{query_task['group_name']}")
                    await self._write_query_status(
                        query_task['opcua_client'],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_NO_DATA
                    )
                else:                  
                    # 使用查询任务中的 opcua_client 创建写入器，并传入组配置和 HTTP 客户端
                    opcua_client = query_task['opcua_client']
                    data_writer = OpcUaDataWriter(opcua_client, query_group_config, self.http_client)
                    
                    # 将查询结果写入 OPC UA 缓冲区（同时发送到 HTTP 服务器）
                    success = await data_writer.write_query_results(
                        query_results,
                        query_time,
                        query_task['point_names']
                    )
                    
                    if success:
                        self.logger.info(f"查询结果已成功写入 OPC UA 缓冲区并发送到 HTTP 服务器：{query_task['group_name']}")
                        await self._write_query_status(
                            query_task['opcua_client'],
                            query_group_config,
                            OpcUaDataWriter.QUERY_STATUS_SUCCESS
                        )
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
                # 写入错误状态（如果有活动的查询任务）
                try:
                    await self._write_query_status(
                        query_task['opcua_client'],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_ERROR
                    )
                except:
                    pass  # 忽略状态写入失败
                await asyncio.sleep(1)

    async def _init_http_server(self, http_config) -> None:
        """
        初始化 HTTP 服务器
        
        Args:
            http_config: HTTP 服务器配置对象
        """
        try:
            # 创建 HTTP 服务器应用
            self.http_server = web.Application()
            
            # 添加路由
            self.http_server.router.add_get('/', self._handle_index)
            self.http_server.router.add_get('/api/latest-data', self._handle_get_latest_data)
            self.http_server.router.add_post('/api/data', self._handle_receive_data)
            
            # 创建运行器
            port = getattr(http_config, 'port', 8080)
            self.http_server_runner = web.AppRunner(self.http_server)
            await self.http_server_runner.setup()
            
            # 启动监听
            site = web.TCPSite(self.http_server_runner, '0.0.0.0', port)
            await site.start()
            
            self.logger.info(f"HTTP 服务器已启动，监听 http://0.0.0.0:{port}")
            self.logger.info(f"访问地址:")
            self.logger.info(f"  - 首页：http://localhost:{port}/")
            self.logger.info(f"  - 最新数据：http://localhost:{port}/api/latest-data")
            
            # 存储最新数据（用于提供给前端）
            self.latest_data = None
            
        except Exception as e:
            self.logger.error(f"HTTP 服务器初始化失败：{e}", exc_info=True)
    
    async def _start_http_server(self) -> None:
        """启动 HTTP 服务器（已经在_init_http_server 中启动，这里保留以便未来扩展）"""
        pass
    
    async def _handle_index(self, request: web.Request) -> web.Response:
        """处理首页请求"""
        try:
            # 读取 line_http.html 文件
            html_path = os.path.join(os.path.dirname(__file__), 'js', 'line_http.html')
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            return web.Response(text=html_content, content_type='text/html')
        except Exception as e:
            self.logger.error(f"读取 HTML 文件失败：{e}", exc_info=True)
            return web.Response(text=f'Error: {e}', status=500)
    
    async def _handle_get_latest_data(self, request: web.Request) -> web.Response:
        """处理获取最新数据的请求"""
        try:
            if hasattr(self, 'latest_data') and self.latest_data is not None:
                return web.json_response({
                    'status': 'success',
                    'data': self.latest_data
                })
            else:
                return web.json_response({
                    'status': 'no_data',
                    'message': '暂无数据'
                })
        except Exception as e:
            self.logger.error(f"处理获取数据请求失败：{e}", exc_info=True)
            return web.json_response({
                'status': 'error',
                'message': str(e)
            }, status=500)
    
    async def _handle_receive_data(self, request: web.Request) -> web.Response:
        """处理接收数据的 POST 请求"""
        try:
            data = await request.json()
            self.latest_data = data
            self.logger.debug(f"收到 HTTP 数据：group={data.get('group_name', 'unknown')}")
            return web.json_response({
                'status': 'success',
                'message': '数据已接收'
            })
        except Exception as e:
            self.logger.error(f"处理接收数据请求失败：{e}", exc_info=True)
            return web.json_response({
                'status': 'error',
                'message': str(e)
            }, status=400)

    def _get_log_file_path(self) -> str:
        """获取当前日志文件路径"""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        configured_log_dir = None
        if self.config and getattr(self.config, "logging", None):
            configured_log_dir = self.config.logging.output_dir
        log_dir = configured_log_dir or os.getenv(
            "SD_SMA_LOG_DIR",
            os.path.join(base_dir, "logs"),
        )
        if not os.path.isabs(log_dir):
            log_dir = os.path.join(base_dir, log_dir)
        return os.path.join(log_dir, "data_collector.log")

    def _get_log_rotation_settings(self) -> tuple[str, int, int, bool]:
        """获取日志轮转配置，包含默认值与容错处理"""
        default_when = "midnight"
        default_interval = 1
        default_backup_days = 14
        default_console_enabled = True

        logging_config = getattr(self.config, "logging", None) if self.config else None
        if not logging_config:
            return default_when, default_interval, default_backup_days, default_console_enabled

        raw_when = str(getattr(logging_config, "rotation_when", default_when)).strip()
        normalized_when = raw_when.upper()
        valid_when = {"S", "M", "H", "D", "MIDNIGHT", "W0", "W1", "W2", "W3", "W4", "W5", "W6"}
        if normalized_when not in valid_when:
            normalized_when = "MIDNIGHT"
        when = "midnight" if normalized_when == "MIDNIGHT" else normalized_when

        try:
            rotation_interval = int(getattr(logging_config, "rotation_interval", default_interval))
        except (TypeError, ValueError):
            rotation_interval = default_interval
        if rotation_interval < 1:
            rotation_interval = default_interval

        try:
            backup_days = int(getattr(logging_config, "backup_days", default_backup_days))
        except (TypeError, ValueError):
            backup_days = default_backup_days
        if backup_days < 1:
            backup_days = default_backup_days

        console_enabled = bool(getattr(logging_config, "console_enabled", default_console_enabled))
        return when, rotation_interval, backup_days, console_enabled


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='BR数据采集系统')
    parser.add_argument('--config', '-c', default='config/sample_config.json',
                       help='配置文件路径')
    parser.add_argument('--query', '-q', action='store_true',
                       help='进入查询模式')
    
    args = parser.parse_args()
    
    if args.query:
        # 查询模式
        run_query_mode(args.config)
    else:
        # 采集模式
        try:
            asyncio.run(run_collection_mode(args.config))
        except KeyboardInterrupt:
            # 避免 asyncio.run 在 Ctrl+C 时输出额外 traceback
            print("\n收到中断信号，已退出。")


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
    except asyncio.CancelledError:
        print("\n收到取消信号，正在停止系统...")
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