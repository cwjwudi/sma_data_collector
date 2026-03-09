"""
数据采集器
负责根据配置定时或触发式采集数据
"""

import asyncio
import logging
import sys
import os
from telnetlib import EL
from typing import Dict, List, Callable, Any, Optional
from datetime import datetime

# 处理相对导入问题
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config_models import DataGroup, DataPoint, TriggerType
from communication.opcua_client import OpcUaClient
from communication.communication_manager import CommunicationManager
from database.data_query import DataQueryProcessor


class DataCollector:
    """数据采集器类"""
    
    def __init__(self, communication_manager: CommunicationManager):
        """
        初始化数据采集器
        
        Args:
            communication_manager: 通信管理器实例
        """
        self.comm_manager = communication_manager
        self.logger = logging.getLogger(__name__)
        self.data_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        self.collectors = {}  # 存储各个数据组的采集任务
        self.point_to_group = {}  # 数据点到数据组的映射，供查询任务使用
        self.query_task_queue: asyncio.Queue = asyncio.Queue()  # 查询任务队列
    
    def register_data_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """
        注册数据回调函数
        
        Args:
            callback: 当采集到数据时调用的函数
        """
        self.data_callbacks.append(callback)
    
    async def start_collection(self, data_groups: List[DataGroup], 
                             data_points_dict: Dict[str, DataPoint]) -> None:
        """
        启动数据采集
        
        Args:
            data_groups: 数据组列表
            data_points_dict: 数据点字典 (name -> DataPoint)
        """
        data_groups_points_dict = {}
        for group in data_groups:
            # 存储数据组信息，供查询任务使用
            data_groups_points_dict[group.name] = group.data_points

            # 获取该组对应的通信客户端
            opcua_client = self.comm_manager.get_client_for_group(group.name)
            if not opcua_client:
                self.logger.error(f"找不到数据组 {group.name} 对应的通信客户端，跳过该组")
                continue
            
            # 获取该组对应的数据点
            group_points = [data_points_dict[name] for name in group.data_points]
            
            if group.trigger == TriggerType.TIME:
                # 时间触发采集
                task = asyncio.create_task(
                    self._time_triggered_collection(group, group_points, opcua_client)
                )
                self.collectors[group.name] = task
                self.logger.info(f"启动时间触发采集组: {group.name}")
                
            elif group.trigger == TriggerType.VARIABLE:
                # 变量触发采集
                trigger_point = data_points_dict[group.trigger_point]
                task = asyncio.create_task(
                    self._variable_triggered_collection(group, group_points, trigger_point, opcua_client)
                )
                self.collectors[group.name] = task
                self.logger.info(f"启动变量触发采集组: {group.name}")

            elif group.trigger == TriggerType.QUERY:
                # 变量触发查询
                trigger_point = data_points_dict[group.trigger_point]
                task = asyncio.create_task(
                    self._query_collection(group, group_points, trigger_point, opcua_client)
                )
                # self.collectors[group.name] = task
                self.logger.info(f"启动查询任务组: {group.name}")

        
        self.point_to_group = self._build_point_to_group_lookup(data_groups_points_dict)
        self.logger.debug(f"构建数据点到数据组的映射: {self.point_to_group}")

    
    async def stop_collection(self) -> None:
        """停止所有数据采集"""
        for name, task in self.collectors.items():
            task.cancel()
            self.logger.info(f"停止采集组: {name}")
        self.collectors.clear()
    
    async def _time_triggered_collection(self, group: DataGroup, 
                                       data_points: List[DataPoint],
                                       opcua_client: OpcUaClient) -> None:
        """时间触发的数据采集"""
        while True:
            try:
                # 读取数据
                data = await opcua_client.read_data_points(data_points)
                
                # 添加元数据
                collection_data = {
                    'group_name': group.name,
                    'collection_time': datetime.now(),
                    'trigger_type': 'time',
                    'data': data
                }
                
                # 调用回调函数
                for callback in self.data_callbacks:
                    callback(collection_data)
                
                # 等待下次采集
                await asyncio.sleep(group.interval_seconds)
                
            except asyncio.CancelledError:
                self.logger.info(f"时间触发采集组 {group.name} 已取消")
                break
            except Exception as e:
                self.logger.error(f"时间触发采集组 {group.name} 发生错误: {e}")
                await asyncio.sleep(5)  # 错误后等待5秒重试
    
    async def _variable_triggered_collection(self, group: DataGroup,
                                           data_points: List[DataPoint],
                                           trigger_point: DataPoint,
                                           opcua_client: OpcUaClient) -> None:
        """变量触发的数据采集 - 实现上升沿触发逻辑"""
        # 记录上一次的触发点状态，用于检测上升沿
        previous_trigger_state = False
        
        while True:
            try:
                # 检查触发点状态
                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_value = trigger_data.get(trigger_point.name, {}).get('value', False)
                
                # 上升沿检测：从False变为True
                if not previous_trigger_state and current_trigger_value:
                    self.logger.info(f"检测到上升沿触发信号: {group.name}")
                    
                    # 读取实际数据
                    data = await opcua_client.read_data_points(data_points)
                    
                    # 根据配置决定是否复位触发点
                    if group.reset_trigger_after_read:
                        success = await opcua_client.write_boolean_value(trigger_point.path, False)
                        if success:
                            self.logger.debug(f"已复位触发点: {trigger_point.name}")
                        else:
                            # 如果复位失败，记录警告但继续处理数据
                            self.logger.warning(f"复位触发点失败: {trigger_point.name}，但这不会影响数据采集")
                    else:
                        self.logger.debug(f"根据配置跳过触发点复位: {trigger_point.name}")
                    
                    # 添加元数据
                    collection_data = {
                        'group_name': group.name,
                        'collection_time': datetime.now(),
                        'trigger_type': 'variable',
                        'trigger_point': trigger_point.name,
                        'data': data
                    }
                    
                    # 调用回调函数
                    for callback in self.data_callbacks:
                        callback(collection_data)
                
                # 更新上一次的状态
                previous_trigger_state = current_trigger_value
                
                # 短暂等待后继续检查
                await asyncio.sleep(0.1)
                
            except asyncio.CancelledError:
                self.logger.info(f"变量触发采集组 {group.name} 已取消")
                break
            except Exception as e:
                self.logger.error(f"变量触发采集组 {group.name} 发生错误: {e}")
                await asyncio.sleep(5)  # 错误后等待5秒重试

    async def _query_collection(self, group: DataGroup,
                              data_points: List[DataPoint],
                              trigger_point: DataPoint,
                              opcua_client: OpcUaClient) -> None:
        """
        变量触发查询 - 实现上升沿触发数据库查询逻辑
        
        查询配置通过 group 的 query_config 字段获取，包括：
        - start_time_field: 起始时间字段名
        - end_time_field: 结束时间字段名
        - query_points: 要查询的数据点列表
        - output_file: 可选的 CSV 输出路径
        """
        previous_trigger_state = False
        
        # 获取查询配置
        query_config = getattr(group, 'query_config', None)
        if not query_config:
            self.logger.warning(f"查询组 {group.name} 没有配置 query_config，使用默认配置")
            query_config = {
                'start_time_field': 'strStartTimes',
                'end_time_field': 'strEndTimes',
                'query_point_field': 'strPointNames',
                'output_file': None
            }
        
        while True:
            try:
                # 检查触发点状态
                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_value = trigger_data.get(trigger_point.name, {}).get('value', False)
                
                # 上升沿检测：从 False 变为 True
                if not previous_trigger_state and current_trigger_value:
                    self.logger.info(f"检测到上升沿触发信号，准备执行数据库查询：{group.name}")
                    
                    # 读取查询参数（从 OPC UA 或其他数据源）
                    query_params = await self._read_query_parameters(
                        data_points, query_config, opcua_client, group
                    )
                    
                    if query_params:
                        # 将查询任务加入队列
                        await self.query_task_queue.put({
                            'start_time': query_params['start_time'],
                            'end_time': query_params['end_time'],
                            'point_names': query_params['point_names'],
                            'group_names': query_params['group_names'],
                            'output_file': query_params.get('output_file'),
                            'group_name': group.name,
                            'opcua_client': opcua_client
                        })
                        self.logger.debug(f"查询任务已加入队列：{group.name}")
                
                # 更新上一次的状态
                previous_trigger_state = current_trigger_value
                
                # 短暂等待后继续检查
                await asyncio.sleep(0.1)
                
            except asyncio.CancelledError:
                self.logger.info(f"查询任务组 {group.name} 已取消")
                break
            except Exception as e:
                self.logger.error(f"查询任务组 {group.name} 发生错误：{e}", exc_info=True)
                await asyncio.sleep(5)

    async def _read_query_parameters(self,
                                   data_points: List[DataPoint],
                                   query_config: Dict[str, Any],
                                   opcua_client: OpcUaClient,
                                   group: DataGroup) -> Optional[Dict[str, Any]]:
        """
        读取查询参数（从 OPC UA 服务器读取时间等信息）
        
        Args:
            data_points: 数据点列表
            query_config: 查询配置
            opcua_client: OPC UA 客户端
            group: 数据组对象
            
        Returns:
            查询参数字典，失败时返回 None
        """
        try:
            # 读取所有相关的数据点
            data = await opcua_client.read_data_points(data_points)
            
            # 提取时间参数
            start_time_str = data.get(query_config['start_time_field'], {}).get('value')
            end_time_str = data.get(query_config['end_time_field'], {}).get('value')
            query_point_str = data.get(query_config['query_point_field'], {}).get('value')
            
            if not start_time_str or not end_time_str:
                self.logger.error("无法从数据点中获取时间信息")
                return None
            
            def _safe_strptime(s, fmt):
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    return None  # 或者 raise，或者记录日志等
                
            fmt = '%Y-%m-%d %H:%M:%S'
            # 解析时间字符串（假设格式为 "YYYY-MM-DD HH:MM:SS"）
            start_time = [_safe_strptime(t, fmt) for t in start_time_str]
            end_time = [_safe_strptime(t, fmt) for t in end_time_str]

            # 验证时间范围
            # 构建 invalid_time_indices：1 表示无效，0 表示有效
            invalid_time_indices = []

            for s, e in zip(start_time, end_time):
                # 如果任一时间为 None，或起始时间 >= 结束时间，则标记为无效（1）
                if s is None or e is None or s >= e:
                    invalid_time_indices.append(1)
                else:
                    invalid_time_indices.append(0)

                    
            invalid_positions = [i for i, val in enumerate(invalid_time_indices) if val == 1]

            if invalid_positions:
                self.logger.error(f"第{invalid_positions}条查询参数的起始时间不能晚于结束时间")

            for i in invalid_positions:
                start_time[i] = None
                end_time[i] = None
                query_point_str[i] = None
            
            group_names = [None] * len(query_point_str)
            # 反查 Point name 所属的 Group name
            for i in range(len(query_point_str)):
                if query_point_str[i] is None:
                    group_names[i] = None
                else:
                    group_names[i] = self.point_to_group(query_point_str[i])

            return {
                'start_time': start_time,
                'end_time': end_time,
                'point_names': query_point_str,
                'group_names': group_names,
                'output_file': query_config.get('output_file')
            }
            
        except Exception as e:
            self.logger.error(f"读取查询参数失败：{e}")
            return None

    def _build_point_to_group_lookup(self, groups):
        """
        构建一个反向查询函数，用于快速根据 point 查找其所属的 group。
        
        参数:
            groups (dict): {group_name (str): [point1, point2, ...]}
            
        返回:
            function: 接收一个 point 字符串，返回对应的 group 名称（str）或 None（如果不存在）
            
        异常:
            ValueError: 如果某个 point 出现在多个 group 中
        """
        point_to_group = {}
        for group_name, points in groups.items():
            for point in points:
                if point in point_to_group:
                    raise ValueError(f"Point '{point}' appears in both '{point_to_group[point]}' and '{group_name}'. Points must be unique to one group.")
                point_to_group[point] = group_name

        def _lookup(point):
            return point_to_group.get(point)
        
        return _lookup
    
    async def _process_query_result(self, 
                                   query_result: List[Dict[str, Any]],
                                   group_name: str,
                                   opcua_client: OpcUaClient) -> None:
        """
        处理查询结果
        
        Args:
            query_result: 查询结果列表
            group_name: 数据组名称
            opcua_client: OPC UA 客户端
        """
        if not query_result:
            self.logger.debug(f"查询结果为空，跳过处理：{group_name}")
            return
        
        # TODO: 根据业务需求处理查询结果
        # 以下是可能的处理方式：
        
        # 1. 记录查询统计信息
        self.logger.info(f"处理查询结果：{group_name}, 记录数={len(query_result)}")
        
        # 2. 如果需要将查询结果回写到 OPC UA
        # await self._write_back_to_opcua(query_result, opcua_client)
        
        # 3. 如果需要发送到其他系统
        # await self._send_to_external_system(query_result, group_name)
        
        # 4. 如果需要保存到其他格式
        # self._save_to_custom_format(query_result, group_name)
