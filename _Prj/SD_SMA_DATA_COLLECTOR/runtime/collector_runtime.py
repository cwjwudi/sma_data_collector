"""
数据采集系统运行时核心
抽离自 main.py，仅保留运行时与业务逻辑，不包含 CLI 参数解析。
"""

import asyncio
import logging
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from typing import Optional

from communication.data_collector import DataCollector
from communication.communication_manager import CommunicationManager
from communication.heartbeat_manager import HeartbeatManager
from communication.opcua_data_writer import OpcUaDataWriter
from core.config_loader import ConfigLoader
from core.config_models import AppConfig
from database.data_query import DataQueryProcessor
from database.data_storage import DataStorageProcessor
from database.db_manager import DatabaseManager

# 禁止 opcua 的 info/debug 日志
logging.getLogger("opcua").setLevel(logging.WARNING)


class DataCollectionSystem:
    """数据采集系统主类（运行时核心）"""

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
        self.config_file = config_file
        self.config: Optional[AppConfig] = None
        self.communication_manager: Optional[CommunicationManager] = None
        self.heartbeat_manager: Optional[HeartbeatManager] = None
        self.data_collector: Optional[DataCollector] = None
        self.db_manager: Optional[DatabaseManager] = None
        self.storage_processor: Optional[DataStorageProcessor] = None
        self.query_processor: Optional[DataQueryProcessor] = None
        self.query_task_processor: Optional[asyncio.Task] = None
        self.running = False
        self.executor = ThreadPoolExecutor(max_workers=5)
        self.setup_logging()

    def setup_logging(self) -> None:
        configured_level = None
        if self.config and getattr(self.config, "logging", None):
            configured_level = getattr(self.config.logging, "level", None)
        log_level_name = (configured_level or os.getenv("SD_SMA_LOG_LEVEL", "INFO")).upper()
        log_level = getattr(logging, log_level_name, logging.INFO)
        log_file = self._get_log_file_path()
        rotation_when, rotation_interval, backup_days, console_enabled = self._get_log_rotation_settings()
        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - "
            "[pid=%(process)d tid=%(threadName)s] %(message)s"
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
        try:
            self.logger.info("正在加载配置...")
            self.config = ConfigLoader.load_from_file(self.config_file)
            self.setup_logging()
            self.logger.info("日志目录: %s", os.path.abspath(os.path.dirname(self._get_log_file_path())))

            self.logger.info("正在初始化通信管理器...")
            self.communication_manager = CommunicationManager(self.config)
            if not await self.communication_manager.initialize_connections():
                self.logger.error("通信管理器初始化失败")
                return False

            self.logger.info("正在初始化心跳管理器...")
            self.heartbeat_manager = HeartbeatManager(self.config, self.communication_manager)

            group_configs = {}
            for group in self.config.groups:
                group_configs[group.name] = {
                    "recreate_interval_days": group.recreate_interval_days,
                    "batch_insert_size": group.batch_insert_size,
                }

            self.logger.info("正在初始化数据库...")
            self.db_manager = DatabaseManager(
                {
                    "type": self.config.database.type,
                    "name": self.config.database.name,
                    "host": self.config.database.host,
                    "port": self.config.database.port,
                    "username": self.config.database.username,
                    "password": self.config.database.password,
                },
                group_configs,
            )

            if not self.db_manager.connect():
                self.logger.error("数据库连接失败")
                return False

            default_batch_size = 10
            if self.config.groups:
                default_batch_size = self.config.groups[0].batch_insert_size

            points_dict = {point.name: point for point in self.config.points}

            self.storage_processor = DataStorageProcessor(
                self.db_manager,
                default_batch_size,
                points_dict,
                self._write_insert_feedback,
            )

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
                self.logger.debug("设置组 %s 的batch_size为 %s", group.name, group.batch_insert_size)

            self.query_processor = DataQueryProcessor(self.db_manager)

            http_config = getattr(self.config, "http_server", None)
            if http_config and getattr(http_config, "enabled", False):
                self.logger.warning(
                    "检测到配置启用了 http_server(enabled=true)，"
                    "但主程序已移除所有 HTTP 功能，将自动忽略该配置。"
                )

            self.data_collector = DataCollector(self.communication_manager)
            self.data_collector.register_data_callback(self._on_data_received)

            self.logger.info("系统初始化完成")
            return True

        except Exception as exc:  # noqa: BLE001
            self.logger.error("系统初始化失败: %s", exc, exc_info=True)
            return False

    def _on_data_received(self, collection_data: dict) -> None:
        if self.storage_processor:
            self.storage_processor.add_data(collection_data)
            self.logger.debug(
                "接收到数据: 组名=%s, 触发类型=%s",
                collection_data["group_name"],
                collection_data["trigger_type"],
            )

    async def start(self) -> None:
        if not self.config or not self.data_collector:
            raise RuntimeError("系统未初始化")

        try:
            self.running = True

            if self.heartbeat_manager:
                await self.heartbeat_manager.start_heartbeats()

            await self.storage_processor.start_processing()

            self.query_task_processor = asyncio.create_task(
                self._process_query_tasks(),
                name="query_task_processor",
            )
            self.logger.info("查询任务处理器已启动")

            data_points_dict = {point.name: point for point in self.config.points}

            target_group_names = self.config.database.data_groups
            if not target_group_names:
                raise ValueError("数据库配置中未指定任何数据组")

            target_groups = [g for g in self.config.groups if g.name in target_group_names]
            if len(target_groups) != len(target_group_names):
                missing_groups = set(target_group_names) - set(g.name for g in target_groups)
                raise ValueError(f"未找到指定的数据组：{missing_groups}")

            self.logger.info("启动数据采集，目标数据组：%s", [g.name for g in target_groups])
            await self.data_collector.start_collection(target_groups, data_points_dict)

            self.logger.info("数据采集系统已启动")
            await self._wait_for_shutdown()

        except Exception as exc:  # noqa: BLE001
            self.logger.error("启动系统时发生错误: %s", exc, exc_info=True)
            raise

    async def stop(self) -> None:
        self.logger.info("正在停止数据采集系统...")
        self.running = False

        try:
            if self.heartbeat_manager:
                await self.heartbeat_manager.stop_heartbeats()
        except Exception as exc:  # noqa: BLE001
            self.logger.error("停止心跳管理器时发生错误：%s", exc, exc_info=True)

        try:
            if self.data_collector:
                await self.data_collector.stop_collection()
        except Exception as exc:  # noqa: BLE001
            self.logger.error("停止数据采集器时发生错误：%s", exc, exc_info=True)

        try:
            if self.query_task_processor:
                self.query_task_processor.cancel()
                try:
                    await self.query_task_processor
                except asyncio.CancelledError:
                    self.logger.info("查询任务处理器已停止")
        except Exception as exc:  # noqa: BLE001
            self.logger.error("停止查询任务处理器时发生错误：%s", exc, exc_info=True)

        try:
            if self.storage_processor:
                await self.storage_processor.stop_processing()
        except Exception as exc:  # noqa: BLE001
            self.logger.error("停止数据存储处理器时发生错误: %s", exc, exc_info=True)

        try:
            if self.communication_manager:
                await self.communication_manager.disconnect_all()
        except Exception as exc:  # noqa: BLE001
            self.logger.error("断开OPC UA连接时发生错误: %s", exc, exc_info=True)

        try:
            if self.db_manager:
                self.db_manager.disconnect()
        except Exception as exc:  # noqa: BLE001
            self.logger.error("断开数据库连接时发生错误：%s", exc, exc_info=True)

        if hasattr(self, "executor") and self.executor:
            self.executor.shutdown(wait=True)
            self.logger.info("线程池已关闭")

        self.logger.info("数据采集系统已停止")

    async def _wait_for_shutdown(self) -> None:
        try:
            while self.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            self.logger.info("收到 KeyboardInterrupt，准备关闭系统...")
        except asyncio.CancelledError:
            self.logger.info("收到取消信号，准备关闭系统...")

    def query_data(
        self,
        start_time: datetime,
        end_time: datetime,
        point_names: list,
        output_file: str,
    ) -> bool:
        if not self.query_processor:
            raise RuntimeError("查询处理器未初始化")
        return self.query_processor.query_data(start_time, end_time, point_names, output_file)

    def get_available_points(self) -> list:
        if not self.query_processor:
            raise RuntimeError("查询处理器未初始化")
        return self.query_processor.get_available_points()

    async def _write_query_status(self, opcua_client, query_group_config, status: int) -> bool:
        try:
            if not query_group_config or not query_group_config.get_feed_back_point():
                self.logger.debug("未配置反馈点，跳过状态写入")
                return True

            data_writer = OpcUaDataWriter(opcua_client, query_group_config)
            return await data_writer._write_feed_back_status(status)

        except Exception as exc:  # noqa: BLE001
            self.logger.error("写入查询状态失败：%s", exc, exc_info=True)
            return False

    async def _write_insert_feedback(self, group_name: str, feedback_point: str, status_code: int) -> bool:
        try:
            if not self.communication_manager:
                self.logger.warning("通信管理器未初始化，无法写入插入反馈")
                return False

            opcua_client = self.communication_manager.get_client_for_group(group_name)
            if not opcua_client:
                self.logger.warning("组 %s 未找到对应通信客户端，无法写入反馈", group_name)
                return False

            data_writer = OpcUaDataWriter(opcua_client, None)
            success = await data_writer.write_udint_feedback(feedback_point, status_code)
            if success:
                self.logger.debug(
                    "组 %s 已写入插入反馈: point=%s, code=%s",
                    group_name,
                    feedback_point,
                    status_code,
                )
            else:
                self.logger.warning(
                    "组 %s 写入插入反馈失败: point=%s, code=%s",
                    group_name,
                    feedback_point,
                    status_code,
                )
            return success
        except Exception as exc:  # noqa: BLE001
            self.logger.error("组 %s 写入插入反馈异常: %s", group_name, exc, exc_info=True)
            return False

    async def _process_query_tasks(self) -> None:
        self.logger.info("查询任务处理器开始运行")

        while self.running:
            try:
                query_task = await asyncio.wait_for(
                    self.data_collector.query_task_queue.get(),
                    timeout=1.0,
                )

                self.logger.info("开始处理查询任务：%s", query_task["group_name"])

                query_group_config = None
                for group in self.config.groups:
                    if group.name == query_task["group_name"]:
                        query_group_config = group
                        break

                await self._write_query_status(
                    query_task["opcua_client"],
                    query_group_config,
                    OpcUaDataWriter.QUERY_STATUS_RUNNING,
                )

                loop = asyncio.get_event_loop()
                query_results, query_time, data_len = await loop.run_in_executor(
                    self.executor,
                    lambda: self.query_processor.query_data(
                        start_times=query_task["start_time"],
                        end_times=query_task["end_time"],
                        point_names=query_task["point_names"],
                        group_names=query_task["group_names"],
                        output_file=query_task.get("output_file"),
                        return_data=True,
                        by_what_time=query_task.get("by_what_time"),
                        aux_queries=query_task.get("aux_queries"),
                    ),
                )

                if query_results is None:
                    self.logger.error("查询任务失败：%s", query_task["group_name"])
                    await self._write_query_status(
                        query_task["opcua_client"],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_ERROR,
                    )
                elif data_len == 0:
                    self.logger.warning("查询结果为空：%s", query_task["group_name"])
                    await self._write_query_status(
                        query_task["opcua_client"],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_NO_DATA,
                    )
                else:
                    opcua_client = query_task["opcua_client"]
                    data_writer = OpcUaDataWriter(opcua_client, query_group_config)

                    success = await data_writer.write_query_results(
                        query_results,
                        query_time,
                        query_task["point_names"],
                    )

                    if success:
                        self.logger.info("查询结果已成功写入 OPC UA 缓冲区：%s", query_task["group_name"])
                        await self._write_query_status(
                            query_task["opcua_client"],
                            query_group_config,
                            OpcUaDataWriter.QUERY_STATUS_SUCCESS,
                        )
                    else:
                        self.logger.warning("写入 OPC UA 缓冲区失败：%s", query_task["group_name"])

                self.data_collector.query_task_queue.task_done()

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                self.logger.info("查询任务处理器被取消")
                break
            except Exception as exc:  # noqa: BLE001
                self.logger.error("处理查询任务时发生错误：%s", exc, exc_info=True)
                try:
                    await self._write_query_status(
                        query_task["opcua_client"],
                        query_group_config,
                        OpcUaDataWriter.QUERY_STATUS_ERROR,
                    )
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(1)

    def _get_log_file_path(self) -> str:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
    except Exception as exc:  # noqa: BLE001
        print(f"系统运行错误: {exc}")
        import traceback

        traceback.print_exc()
    finally:
        try:
            await system.stop()
        except Exception as exc:  # noqa: BLE001
            print(f"停止系统时发生错误: {exc}")


def run_query_mode(config_file: str):
    """运行查询模式"""
    system = DataCollectionSystem(config_file)

    try:
        if not asyncio.run(system.initialize()):
            print("系统初始化失败")
            return

        points = system.get_available_points()
        print("可用数据点:")
        for i, point in enumerate(points, 1):
            print(f"{i}. {point}")

        if not points:
            print("没有可用的数据点")
            return

        print("\n请输入查询参数:")
        start_time_str = input("开始时间 (YYYY-MM-DD HH:MM:SS): ")
        end_time_str = input("结束时间 (YYYY-MM-DD HH:MM:SS): ")
        output_file = input("输出文件路径 (如: output.csv): ")

        start_time = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        end_time = datetime.strptime(end_time_str, "%Y-%m-%d %H:%M:%S")

        if system.query_data(start_time, end_time, points, output_file):
            print(f"数据查询成功，已保存到: {output_file}")
        else:
            print("数据查询失败")

    except KeyboardInterrupt:
        print("\n查询被中断")
    except Exception as exc:  # noqa: BLE001
        print(f"查询过程中发生错误: {exc}")
    finally:
        asyncio.run(system.stop())
