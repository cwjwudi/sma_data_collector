"""
数据存储处理器
负责接收采集数据并批量写入数据库
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from collections import deque
# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import DatabaseManager


class DataStorageProcessor:
    """数据存储处理器类"""
    
    def __init__(self, db_manager: DatabaseManager, batch_size: int = 100, points_dict: dict = None):
        """
        初始化数据存储处理器
        
        Args:
            db_manager: 数据库管理器实例
            batch_size: 默认批量插入大小（用于向后兼容）
            points_dict: 数据点字典 {point_name: DataPoint}，用于获取 datatype 信息
        """
        self.db_manager = db_manager
        self.default_batch_size = batch_size
        self.group_batch_sizes = {}  # 存储各组的batch_size配置
        self.points_dict = points_dict or {}  # 数据点配置字典
        self.data_queue = deque()
        self.processing_task = None
        self.running = False
        self.logger = logging.getLogger(__name__)
        self.column_types_cache = {}  # 缓存列类型信息
        self._batch_ready_event: Optional[asyncio.Event] = None # 某组达到 batch大小时唤醒处理循环
    
    def add_data(self, collection_data: Dict[str, Any]) -> None:
        """
        添加采集数据到队列
        
        Args:
            collection_data: 采集的数据
        """
        self.data_queue.append(collection_data)
        self.logger.debug(f"数据已添加到队列，当前队列大小: {len(self.data_queue)}")
        
        group_name = collection_data.get('group_name')
        if group_name is not None:
            batch_size = self.group_batch_sizes.get(group_name, self.default_batch_size)
            group_count = sum(1 for x in self.data_queue if x.get('group_name') == group_name)
            if group_count >= batch_size:
                ev = self._batch_ready_event
                if ev is not None and not ev.is_set():
                    ev.set()
    
    async def start_processing(self) -> None:
        """启动数据处理任务"""
        if self.running:
            return
        
        self.running = True
        self._batch_ready_event = asyncio.Event()
        self.processing_task = asyncio.create_task(self._process_data_loop())
        self.logger.info("数据存储处理器已启动")
    
    async def stop_processing(self) -> None:
        """停止数据处理任务"""
        self.running = False
        self._batch_ready_event = None
        if self.processing_task:
            self.processing_task.cancel()
            try:
                await self.processing_task
            except asyncio.CancelledError:
                pass
        self.logger.info("数据存储处理器已停止")
    
    async def _process_data_loop(self) -> None:
        """数据处理循环"""
        while self.running:
            try:
                # 检查是否有足够的数据进行批量处理
                if self._has_enough_data_for_batch():
                    # 按组分别处理数据
                    await self._process_data_by_groups()
                else:
                    # 队列有数据但未达批量：睡眠或等待 add_data 达到 batch 时的唤醒（避免单次涌入多行仍等满 1 秒）
                    if self.data_queue:
                        ev = self._batch_ready_event
                        if ev is not None:
                            wait_ev = asyncio.create_task(ev.wait())
                            wait_sleep = asyncio.create_task(asyncio.sleep(1))
                            done, pending = await asyncio.wait(
                                {wait_ev, wait_sleep},
                                return_when=asyncio.FIRST_COMPLETED,
                            )
                            for t in pending:
                                t.cancel()
                            ev.clear()
                        else:
                            await asyncio.sleep(1)
                    else:
                        ev = self._batch_ready_event
                        if ev is not None:
                            wait_ev = asyncio.create_task(ev.wait())
                            wait_short = asyncio.create_task(asyncio.sleep(0.1))
                            done, pending = await asyncio.wait(
                                {wait_ev, wait_short},
                                return_when=asyncio.FIRST_COMPLETED,
                            )
                            for t in pending:
                                t.cancel()
                            ev.clear()
                        else:
                            await asyncio.sleep(0.1)
                        
            except asyncio.CancelledError:
                # 处理剩余数据
                if self.data_queue:
                    remaining_data = list(self.data_queue)
                    self.data_queue.clear()
                    await self._process_batch(remaining_data)
                break
            except Exception as e:
                self.logger.error(f"数据处理过程中发生错误: {e}", exc_info=True)
                await asyncio.sleep(5)
    
    def _has_enough_data_for_batch(self) -> bool:
        """
        检查是否有足够的数据进行批量处理
        """
        if not self.data_queue:
            return False
            
        # 按组统计数据量
        group_counts = {}
        temp_queue = list(self.data_queue)
        
        for data_item in temp_queue:
            group_name = data_item['group_name']
            group_counts[group_name] = group_counts.get(group_name, 0) + 1
        
        # 检查是否有任何一个组达到了其batch_size
        for group_name, count in group_counts.items():
            batch_size = self.group_batch_sizes.get(group_name, self.default_batch_size)
            if count >= batch_size:
                return True
        
        return False
    
    async def _process_data_by_groups(self) -> None:
        """
        按组分别处理数据
        """
        # 按组分组数据
        grouped_data = {}
        
        # 先收集所有可以处理的数据
        temp_queue = list(self.data_queue)
        processable_data = []
        unprocessable_data = []
        
        group_counts = {}
        for data_item in temp_queue:
            group_name = data_item['group_name']
            group_counts[group_name] = group_counts.get(group_name, 0) + 1
        
        # 分离可处理和不可处理的数据
        for data_item in temp_queue:
            group_name = data_item['group_name']
            batch_size = self.group_batch_sizes.get(group_name, self.default_batch_size)
            
            if group_counts[group_name] >= batch_size:
                processable_data.append(data_item)
            else:
                unprocessable_data.append(data_item)
        
        # 更新队列
        self.data_queue.clear()
        for data_item in unprocessable_data:
            self.data_queue.append(data_item)
        
        # 按组处理可处理的数据
        grouped_processable = {}
        for data_item in processable_data:
            group_name = data_item['group_name']
            if group_name not in grouped_processable:
                grouped_processable[group_name] = []
            grouped_processable[group_name].append(data_item)
        
        # 分别处理每个组的数据
        for group_name, group_data_list in grouped_processable.items():
            await self._process_group_data(group_name, group_data_list)
    
    async def _process_batch(self, batch_data: List[Dict[str, Any]]) -> None:
        """
        处理一批数据
        
        Args:
            batch_data: 批量数据列表
        """
        if not batch_data:
            return
        
        try:
            # 按组名分组数据，确保每个组的数据单独处理
            grouped_data = {}
            for data_item in batch_data:
                group_name = data_item['group_name']
                if group_name not in grouped_data:
                    grouped_data[group_name] = []
                grouped_data[group_name].append(data_item)
            
            # 分别处理每个组的数据
            for group_name, group_data_list in grouped_data.items():
                await self._process_group_data(group_name, group_data_list)
            
        except Exception as e:
            self.logger.error(f"批处理数据失败: {e}", exc_info=True)
    
    async def _process_group_data(self, group_name: str, group_data_list: List[Dict[str, Any]]) -> None:
        """
        处理单个组的数据
        
        Args:
            group_name: 组名
            group_data_list: 该组的数据列表
        """
        try:
            # 获取第一个数据项来确定表结构
            sample_data = group_data_list[0]
            # 传递group_name给数据库管理器
            table_name = self.db_manager.get_current_table_name(group_name)
            
            # 准备插入数据
            insert_data_list = []
            column_types = self._infer_column_types(sample_data)
            
            # 创建表（如果不存在）
            if not self._ensure_table_exists(table_name, column_types):
                return
            
            # 转换数据格式
            for data_item in group_data_list:
                insert_data = self._convert_to_db_format(data_item)
                if insert_data:
                    insert_data_list.append(insert_data)
            
            # 批量插入
            success_count = 0
            for data_row in insert_data_list:
                if self.db_manager.execute_insert(table_name, data_row):
                    success_count += 1
            
            self.logger.info(f"批量插入完成: 成功 {success_count}/{len(insert_data_list)} 条记录到表 {table_name} (group: {group_name})")
            
        except Exception as e:
            self.logger.error(f"处理组 {group_name} 数据失败: {e}", exc_info=True)
    
    def _infer_column_types(self, sample_data: Dict[str, Any]) -> Dict[str, str]:
        """
        推断列的数据类型，优先使用配置中的 datatype
        
        Args:
            sample_data: 样本数据
            
        Returns:
            Dict[str, str]: 列名到数据类型的映射
        """
        group_name = sample_data['group_name']
        
        if group_name in self.column_types_cache:
            return self.column_types_cache[group_name]
        
        column_types = {}
        data_points = sample_data['data']
        
        for point_name, point_data in data_points.items():
            value = point_data.get('value')
            
            # 优先使用配置中的 datatype
            if point_name in self.points_dict:
                point_config = self.points_dict[point_name]
                datatype = getattr(point_config, 'datatype', None)
                
                if datatype:
                    # 根据配置的 datatype 确定数据库类型
                    column_type = self._get_db_type_from_datatype(datatype)
                    column_types[point_name] = column_type
                    self.logger.debug(f"列类型从配置推断 (point: {point_name}, datatype: {datatype}, db_type: {column_type})")
                    continue
            
            # 如果没有配置 datatype，回退到基于值的推断
            if value is not None:
                if isinstance(value, bool):
                    column_types[point_name] = "BOOLEAN"
                elif isinstance(value, int):
                    column_types[point_name] = "INTEGER"
                elif isinstance(value, float):
                    column_types[point_name] = "DOUBLE"
                elif isinstance(value, datetime):
                    column_types[point_name] = "DATETIME"
                else:
                    column_types[point_name] = "VARCHAR(255)"
            else:
                column_types[point_name] = "VARCHAR(255)"
        
        self.column_types_cache[group_name] = column_types
        self.logger.info(f"推断列类型: {column_types}")
        return column_types
    
    def _get_db_type_from_datatype(self, datatype: str) -> str:
        """
        根据配置的 datatype 转换为数据库类型
        
        Args:
            datatype: 数据类型字符串
            
        Returns:
            str: 数据库类型字符串
        """
        datatype_lower = datatype.lower().strip()
        
        # datetime 类型映射
        if datatype_lower == 'datetime':
            return 'DATETIME'
        
        # 整数类型映射
        elif datatype_lower in ['int', 'integer']:
            return 'INTEGER'
        
        # 浮点数类型映射
        elif datatype_lower in ['float', 'double', 'real']:
            return 'DOUBLE'
        
        # 字符串类型映射
        elif datatype_lower in ['str', 'string', 'varchar', 'text']:
            return 'VARCHAR(255)'
        
        # 布尔类型映射
        elif datatype_lower in ['bool', 'boolean']:
            return 'BOOLEAN'
        
        # 默认返回 VARCHAR
        else:
            self.logger.warning(f"未知的 datatype: {datatype}，使用 VARCHAR(255)")
            return 'VARCHAR(255)'
    
    def _ensure_table_exists(self, table_name: str, column_types: Dict[str, str]) -> bool:
        """
        确保数据表存在
        
        Args:
            table_name: 表名
            column_types: 列类型定义
            
        Returns:
            bool: 表是否存在或创建成功
        """
        try:
            # 检查表是否存在
            check_sql = """
            SELECT name FROM sqlite_master WHERE type='table' AND name=?
            """ if self.db_manager.db_config['type'].lower() == 'sqlite' else """
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = DATABASE() AND table_name = %s
            """
            
            # 简化处理：直接尝试创建表（IF NOT EXISTS）
            return self.db_manager.create_data_table(table_name, column_types)
            
        except Exception as e:
            self.logger.error(f"确保表存在时出错: {e}", exc_info=True)
            return False
    
    def _convert_to_db_format(self, collection_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        将采集数据转换为数据库格式
        
        Args:
            collection_data: 采集的数据
            
        Returns:
            Optional[Dict[str, Any]]: 转换后的数据，失败时返回None
        """
        try:
            db_data = {}
            collection_time = collection_data['collection_time']
            
            # 添加通用字段
            db_data['collection_time'] = collection_time
            
            # 添加数据点值
            data_points = collection_data['data']
            for point_name, point_data in data_points.items():
                value = point_data.get('value')
                
                # 如果配置了 datatype，则进行类型转换
                if point_name in self.points_dict:
                    point_config = self.points_dict[point_name]
                    datatype = getattr(point_config, 'datatype', None)
                    
                    if datatype and value is not None:
                        # 根据 datatype 进行类型转换
                        converted_value = self._convert_value_by_datatype(value, datatype, point_name)
                        db_data[point_name] = converted_value
                    else:
                        # 没有配置 datatype 或值为 None，直接存储
                        db_data[point_name] = value
                else:
                    # 数据点不在配置中，直接存储
                    db_data[point_name] = value
            
            return db_data
            
        except Exception as e:
            self.logger.error(f"数据格式转换失败: {e}", exc_info=True)
            return None
    
    def _convert_value_by_datatype(self, value: Any, datatype: str, point_name: str) -> Any:
        """
        根据 datatype 转换值类型
        
        Args:
            value: 原始值
            datatype: 数据类型字符串（如 "datetime", "int", "float", "string"）
            point_name: 数据点名称（用于日志记录）
            
        Returns:
            转换后的值
        """
        try:
            datatype_lower = datatype.lower().strip()
            
            if datatype_lower == 'datetime':
                # datetime 类型：将字符串转换为 datetime 对象
                if isinstance(value, str):
                    # 尝试多种常见的时间格式
                    datetime_formats = [
                        '%Y-%m-%d %H:%M:%S',
                        '%Y-%m-%d %H:%M:%S.%f',
                        '%Y-%m-%dT%H:%M:%S',
                        '%Y-%m-%dT%H:%M:%S.%f',
                        '%Y-%m-%dT%H:%M:%SZ',
                        '%Y/%m/%d %H:%M:%S',
                        '%Y%m%d%H%M%S',
                        'DT#%Y-%m-%d-%H:%M:%S',  # 支持 DT#2022-03-19-17:41:48 这种格式中的日期部分解析逻辑需特殊处理，但标准strptime不支持前缀，因此下面会添加特殊处理
                    ]
                    
                    for fmt in datetime_formats:
                        try:
                            dt = datetime.strptime(value, fmt)
                            self.logger.debug(f"成功将 '{value}' 转换为 datetime (格式: {fmt})")
                            return dt
                        except ValueError:
                            continue
                    
                    # 如果所有格式都失败，记录警告并返回原始值
                    self.logger.warning(f"无法将 '{value}' 解析为 datetime (point: {point_name})，使用原始值")
                    return value
                elif isinstance(value, datetime):
                    # 已经是 datetime 对象，直接返回
                    return value
                else:
                    self.logger.warning(f"datetime 类型的值不是字符串: {type(value)} (point: {point_name})")
                    return value
            
            elif datatype_lower in ['int', 'integer']:
                # 整数类型
                try:
                    return int(value)
                except (ValueError, TypeError):
                    self.logger.warning(f"无法将 '{value}' 转换为 int (point: {point_name})")
                    return value
            
            elif datatype_lower in ['float', 'double', 'real']:
                # 浮点数类型
                try:
                    return float(value)
                except (ValueError, TypeError):
                    self.logger.warning(f"无法将 '{value}' 转换为 float (point: {point_name})")
                    return value
            
            elif datatype_lower in ['str', 'string', 'varchar', 'text']:
                # 字符串类型
                return str(value) if value is not None else None
            
            elif datatype_lower in ['bool', 'boolean']:
                # 布尔类型
                if isinstance(value, bool):
                    return value
                elif isinstance(value, str):
                    return value.lower() in ['true', '1', 'yes', 'on']
                else:
                    return bool(value)
            
            else:
                # 未知类型，返回原始值
                self.logger.debug(f"未知的 datatype: {datatype} (point: {point_name})，使用原始值")
                return value
                
        except Exception as e:
            self.logger.error(
                f"类型转换失败 (point: {point_name}, datatype: {datatype}): {e}",
                exc_info=True
            )
            return value
    
    def get_queue_size(self) -> int:
        """获取队列大小"""
        return len(self.data_queue)