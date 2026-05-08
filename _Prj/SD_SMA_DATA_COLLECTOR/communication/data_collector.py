"""
数据采集器
负责根据配置定时或触发式采集数据
"""

import asyncio
import logging
import sys
import os
import time
from typing import Dict, List, Callable, Any, Optional, Iterator
from datetime import datetime

# 处理相对导入问题
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config_models import DataGroup, DataPoint, TriggerType
from communication.opcua_client import OpcUaClient
from communication.communication_manager import CommunicationManager
from database.data_query import DataQueryProcessor


def _is_opcua_transient(exc: BaseException) -> bool:
    """手动断线、PLC 关机、对端不可达等：用简短日志即可，不必打 ERROR 全栈。"""
    if isinstance(exc, (ConnectionError, TimeoutError)):
        return True
    if isinstance(exc, OSError):
        code = getattr(exc, "errno", None)
        if code in {10054, 10053, 10051, 10050, 10060, 10061, 110, 111, 113}:
            return True
    return False
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
    
    def _iter_scalar_collection_rows(self, collection_data: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
        """
        将并行采集结果（各数据点 value 为等长列表）拆成多行，每行各点为标量。
        若结构不符合并行列表形态，则原样返回一行。
        """
        data = collection_data.get('data') or {}
        if not collection_data.get('is_parallel') or not data:
            yield collection_data
            return
        lengths: List[int] = []
        for name, info in data.items():
            if not isinstance(info, dict):
                self.logger.warning(
                    f"并行组 {collection_data.get('group_name')} 数据点 {name} 结构异常，不拆分行"
                )
                yield collection_data
                return
            v = info.get('value')
            if not isinstance(v, (list, tuple)):
                self.logger.warning(
                    f"并行组 {collection_data.get('group_name')} 数据点 {name} 值非列表，不拆分行"
                )
                yield collection_data
                return
            lengths.append(len(v))
        if not lengths:
            yield collection_data
            return
        n = lengths[0]
        if any(L != n for L in lengths):
            self.logger.warning(
                f"并行组 {collection_data.get('group_name')} 各点列表长度不一致 {lengths}，不拆分行"
            )
            yield collection_data
            return
        triggered_indices: List[int] = collection_data.get('triggered_indices') or []
        if len(triggered_indices) != n:
            triggered_indices = list(range(n))
        for j in range(n):
            row_data: Dict[str, Any] = {}
            for name, info in data.items():
                v = info['value']
                row_data[name] = {
                    'value': v[j],
                    'timestamp': info.get('timestamp'),
                    'path': info.get('path'),
                }
            yield {
                'group_name': collection_data['group_name'],
                'collection_time': collection_data['collection_time'],
                'trigger_type': collection_data['trigger_type'],
                'trigger_point': collection_data.get('trigger_point'),
                'is_parallel': False,
                'trigger_index': triggered_indices[j],
                'data': row_data,
            }
    
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
                if group.is_parallel:
                    task = asyncio.create_task(
                        self._parallel_variable_triggered_collection(group, group_points, trigger_point, opcua_client)
                    )
                    self.collectors[group.name] = task
                    self.logger.info(f"启动并行变量触发采集组: {group.name}")
                else:
                    task = asyncio.create_task(
                        self._variable_triggered_collection(group, group_points, trigger_point, opcua_client)
                    )
                    self.collectors[group.name] = task
                    self.logger.info(f"启动变量触发采集组: {group.name}")

            elif group.trigger == TriggerType.TIME_AND_VARIABLE:
                trigger_point = data_points_dict[group.trigger_point]
                task = asyncio.create_task(
                    self._time_and_variable_collection(
                        group, group_points, trigger_point, opcua_client
                    )
                )
                self.collectors[group.name] = task
                self.logger.info(f"启动时间+变量触发采集组: {group.name}")

            elif group.trigger == TriggerType.QUERY:
                # 变量触发查询（必须登记到 collectors，否则 stop_collection 无法取消轮询任务）
                trigger_point = data_points_dict[group.trigger_point]
                task = asyncio.create_task(
                    self._query_collection(group, group_points, trigger_point, opcua_client)
                )
                self.collectors[group.name] = task
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
        """时间触发的数据采集。

        使用单调时钟维护计划节拍：每轮开始前睡到本组的 next_deadline。
        本轮结束后将 next_deadline 推进 interval；若实际结束时间已晚于该计划时刻
        （读点/回调超时），则不再追欠拍，将下一拍重置为「当前时刻 + interval」。
        """
        interval = float(group.interval_seconds)
        next_deadline = time.monotonic()

        while True:
            try:
                now = time.monotonic()
                wait = next_deadline - now
                if wait > 0:
                    await asyncio.sleep(wait)

                data = await opcua_client.read_data_points(data_points)

                valid_data = {name: info for name, info in data.items() if info.get('value') is not None}

                if not valid_data:
                    self.logger.warning(f"采集组 {group.name} 所有数据点读取失败，跳过本次采集")
                else:
                    invalid_points = [name for name, info in data.items() if info.get('value') is None]
                    if invalid_points:
                        self.logger.warning(f"采集组 {group.name} 以下数据点读取失败，已过滤：{invalid_points}")

                    collection_data = {
                        'group_name': group.name,
                        'collection_time': datetime.now(),
                        'trigger_type': 'time',
                        'data': valid_data
                    }

                    for callback in self.data_callbacks:
                        callback(collection_data)

                now = time.monotonic()
                next_deadline += interval
                if now > next_deadline:
                    next_deadline = now + interval

            except asyncio.CancelledError:
                self.logger.info(f"时间触发采集组 {group.name} 已取消")
                break
            except Exception as e:
                if _is_opcua_transient(e):
                    self.logger.warning(
                        "时间触发采集组 %s OPC UA 暂不可用，5s 后重试: %s: %s",
                        group.name,
                        type(e).__name__,
                        e,
                    )
                else:
                    self.logger.error(f"时间触发采集组 {group.name} 发生错误: {e}", exc_info=True)
                await asyncio.sleep(5)  # 错误后等待5秒重试
                next_deadline = time.monotonic() + interval

    async def _time_and_variable_collection(
        self,
        group: DataGroup,
        data_points: List[DataPoint],
        trigger_point: DataPoint,
        opcua_client: OpcUaClient,
    ) -> None:
        """
        按 interval_seconds 定时采集；同时以 trigger_interval_seconds 为周期采样 trigger_point，
        上升沿时立即采集一次（行为与同组 variable 模式一致，含可选复位）。
        """
        trigger_interval = float(group.trigger_interval_seconds)
        next_time_deadline = 0.0
        previous_trigger_state = False

        async def do_time_collect() -> None:
            nonlocal next_time_deadline
            data = await opcua_client.read_data_points(data_points)
            valid_data = {
                name: info for name, info in data.items() if info.get('value') is not None
            }
            if not valid_data:
                self.logger.warning(
                    f"采集组 {group.name}（time_and_variable 定时）所有数据点读取失败，跳过本次采集"
                )
            else:
                invalid_points = [name for name, info in data.items() if info.get('value') is None]
                if invalid_points:
                    self.logger.warning(
                        f"采集组 {group.name}（定时）以下数据点读取失败，已过滤：{invalid_points}"
                    )
                collection_data = {
                    'group_name': group.name,
                    'collection_time': datetime.now(),
                    'trigger_type': 'time',
                    'data': valid_data,
                }
                for callback in self.data_callbacks:
                    callback(collection_data)
            next_time_deadline = time.monotonic() + float(group.interval_seconds)

        while True:
            try:
                now = time.monotonic()
                if now >= next_time_deadline:
                    await do_time_collect()

                until_next = next_time_deadline - time.monotonic()
                sleep_for = min(trigger_interval, max(0.001, until_next))
                await asyncio.sleep(sleep_for)

                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_value = trigger_data.get(trigger_point.name, {}).get('value', False)

                if not previous_trigger_state and current_trigger_value:
                    self.logger.info(
                        f"检测到上升沿触发信号（time_and_variable）: {group.name}"
                    )
                    data = await opcua_client.read_data_points(data_points)
                    valid_data = {
                        name: info for name, info in data.items() if info.get('value') is not None
                    }
                    if not valid_data:
                        self.logger.warning(
                            f"采集组 {group.name}（time_and_variable 变量触发）所有数据点读取失败，跳过本次采集"
                        )
                    else:
                        invalid_points = [
                            name for name, info in data.items() if info.get('value') is None
                        ]
                        if invalid_points:
                            self.logger.warning(
                                f"采集组 {group.name}（变量触发）以下数据点读取失败，已过滤：{invalid_points}"
                            )
                        if group.reset_trigger_after_read:
                            success = await opcua_client.write_boolean_value(
                                trigger_point.path, False
                            )
                            if success:
                                self.logger.debug(f"已复位触发点：{trigger_point.name}")
                            else:
                                self.logger.warning(
                                    f"复位触发点失败：{trigger_point.name}，但这不会影响数据采集"
                                )
                        else:
                            self.logger.debug(f"根据配置跳过触发点复位：{trigger_point.name}")

                        collection_data = {
                            'group_name': group.name,
                            'collection_time': datetime.now(),
                            'trigger_type': 'variable',
                            'trigger_point': trigger_point.name,
                            'data': valid_data,
                        }
                        for callback in self.data_callbacks:
                            callback(collection_data)

                previous_trigger_state = current_trigger_value

                now = time.monotonic()
                if now >= next_time_deadline:
                    await do_time_collect()

            except asyncio.CancelledError:
                self.logger.info(f"time_and_variable 采集组 {group.name} 已取消")
                break
            except Exception as e:
                if _is_opcua_transient(e):
                    self.logger.warning(
                        "time_and_variable 采集组 %s OPC UA 暂不可用，5s 后重试: %s: %s",
                        group.name,
                        type(e).__name__,
                        e,
                    )
                else:
                    self.logger.error(f"time_and_variable 采集组 {group.name} 发生错误: {e}", exc_info=True)
                await asyncio.sleep(5)
    
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
                                        
                    # 过滤掉值为 None 的数据点
                    valid_data = {name: info for name, info in data.items() if info.get('value') is not None}
                                        
                    # 检查是否有有效数据
                    if not valid_data:
                        self.logger.warning(f"变量触发组 {group.name} 所有数据点读取失败，跳过本次采集")
                    else:
                        # 记录无效数据点（可选）
                        invalid_points = [name for name, info in data.items() if info.get('value') is None]
                        if invalid_points:
                            self.logger.warning(f"变量触发组 {group.name} 以下数据点读取失败，已过滤：{invalid_points}")
                                            
                        # 根据配置决定是否复位触发点
                        if group.reset_trigger_after_read:
                            success = await opcua_client.write_boolean_value(trigger_point.path, False)
                            if success:
                                self.logger.debug(f"已复位触发点：{trigger_point.name}")
                            else:
                                # 如果复位失败，记录警告但继续处理数据
                                self.logger.warning(f"复位触发点失败：{trigger_point.name}，但这不会影响数据采集")
                        else:
                            self.logger.debug(f"根据配置跳过触发点复位：{trigger_point.name}")
                                            
                        # 添加元数据
                        collection_data = {
                            'group_name': group.name,
                            'collection_time': datetime.now(),
                            'trigger_type': 'variable',
                            'trigger_point': trigger_point.name,
                            'data': valid_data
                        }
                                            
                        # 调用回调函数
                        for callback in self.data_callbacks:
                            callback(collection_data)
                
                # 更新上一次的状态
                previous_trigger_state = current_trigger_value
                
                # 短暂等待后继续检查
                await asyncio.sleep(group.interval_seconds)
                
            except asyncio.CancelledError:
                self.logger.info(f"变量触发采集组 {group.name} 已取消")
                break
            except Exception as e:
                if _is_opcua_transient(e):
                    self.logger.warning(
                        "变量触发采集组 %s OPC UA 暂不可用，5s 后重试: %s: %s",
                        group.name,
                        type(e).__name__,
                        e,
                    )
                else:
                    self.logger.error(f"变量触发采集组 {group.name} 发生错误: {e}", exc_info=True)
                await asyncio.sleep(5)  # 错误后等待5秒重试

    async def _parallel_variable_triggered_collection(self, group: DataGroup,
                                                       data_points: List[DataPoint],
                                                       trigger_point: DataPoint,
                                                       opcua_client: OpcUaClient) -> None:
        """并行变量触发的数据采集 - trigger_point 为布尔数组，data_points 为数组节点，
        检测上升沿索引，提取对应索引的数据"""
        previous_trigger_state = None

        while True:
            try:
                # 读取触发点数组
                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_values = trigger_data.get(trigger_point.name, {}).get('value')

                if current_trigger_values is None:
                    self.logger.warning(f"并行触发组 {group.name} 读取触发点失败")
                    await asyncio.sleep(group.interval_seconds)
                    continue

                # 首次读取仅初始化状态，不触发
                if previous_trigger_state is None:
                    previous_trigger_state = list(current_trigger_values)
                    self.logger.info(f"并行触发组 {group.name} 初始化触发状态，数组长度={len(current_trigger_values)}")
                    await asyncio.sleep(group.interval_seconds)
                    continue

                # 检测上升沿索引
                triggered_indices = []
                for i, (prev, curr) in enumerate(zip(previous_trigger_state, current_trigger_values)):
                    if not prev and curr:
                        triggered_indices.append(i)

                if triggered_indices:
                    self.logger.info(f"并行触发组 {group.name} 检测到上升沿，触发索引: {triggered_indices}")

                    # 读取所有数据点（每个返回数组）
                    data = await opcua_client.read_data_points(data_points)

                    # 构建合并的 collection_data
                    indexed_data = {}
                    for point in data_points:
                        point_data = data.get(point.name, {})
                        array_value = point_data.get('value')
                        if array_value is not None and isinstance(array_value, (list, tuple)):
                            extracted = [array_value[i] for i in triggered_indices if i < len(array_value)]
                            indexed_data[point.name] = {
                                'value': extracted,
                                'timestamp': point_data.get('timestamp'),
                                'path': point_data.get('path'),
                                'triggered_indices': triggered_indices
                            }
                        else:
                            self.logger.warning(f"并行触发组 {group.name} 数据点 {point.name} 不是数组或值为 None")

                    if indexed_data:
                        collection_data = {
                            'group_name': group.name,
                            'collection_time': datetime.now(),
                            'trigger_type': 'variable',
                            'trigger_point': trigger_point.name,
                            'is_parallel': True,
                            'triggered_indices': triggered_indices,
                            'data': indexed_data
                        }

                        # 并行结果按索引拆成多行标量，逐行回调（便于入库与 batch 计数）
                        for row in self._iter_scalar_collection_rows(collection_data):
                            for callback in self.data_callbacks:
                                callback(row)

                    # 复位已触发的索引
                    if group.reset_trigger_after_read:
                        reset_values = list(current_trigger_values)
                        for idx in triggered_indices:
                            if idx < len(reset_values):
                                reset_values[idx] = False
                        success = await opcua_client.write_array_value(trigger_point.path, reset_values)
                        if success:
                            self.logger.debug(f"已复位触发点索引: {triggered_indices}")
                        else:
                            self.logger.warning(f"复位触发点索引失败: {triggered_indices}")

                # 更新上一次的状态
                previous_trigger_state = list(current_trigger_values)

                await asyncio.sleep(group.interval_seconds)

            except asyncio.CancelledError:
                self.logger.info(f"并行触发采集组 {group.name} 已取消")
                break
            except Exception as e:
                if _is_opcua_transient(e):
                    self.logger.warning(
                        "并行触发采集组 %s OPC UA 暂不可用，5s 后重试: %s: %s",
                        group.name,
                        type(e).__name__,
                        e,
                    )
                else:
                    self.logger.error(f"并行触发采集组 {group.name} 发生错误: {e}", exc_info=True)
                await asyncio.sleep(5)

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
                            'by_what_time': query_params.get('by_what_time'),  # 支持自定义时间字段
                            'aux_queries': query_params.get('aux_queries'),  # 支持附加查询条件
                            'group_name': group.name,
                            'opcua_client': opcua_client
                        })
                        self.logger.debug(f"查询任务已加入队列：{group.name}")
                
                # 更新上一次的状态
                previous_trigger_state = current_trigger_value
                
                # 短暂等待后继续检查
                await asyncio.sleep(group.interval_seconds)
                
            except asyncio.CancelledError:
                self.logger.info(f"查询任务组 {group.name} 已取消")
                break
            except Exception as e:
                if _is_opcua_transient(e):
                    self.logger.warning(
                        "查询任务组 %s OPC UA 暂不可用，5s 后重试: %s: %s",
                        group.name,
                        type(e).__name__,
                        e,
                    )
                else:
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
            
            # 提取附加查询条件
            aux_query_field = query_config.get('aux_query_field')
            aux_query_str = None
            if aux_query_field:
                aux_query_str = data.get(aux_query_field, {}).get('value')
            
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

            # 检查 data_points 中名称为空的情况
            for i in range(len(query_point_str)):
                if query_point_str[i] is None or query_point_str[i] == '':
                    if i not in invalid_positions:
                        invalid_positions.append(i)
            
            # 去重并排序 invalid_positions
            invalid_positions = sorted(set[int](invalid_positions))

            if invalid_positions:
                self.logger.error(f"第{invalid_positions}条查询参数设定了无效的时间范围或数据点名称为空")

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
                    group_name_result = self.point_to_group(query_point_str[i])
                    if group_name_result is None:
                        self.logger.error(f"找不到数据点 '{query_point_str[i]}' 对应的数据组")
                    group_names[i] = group_name_result

            return {
                'start_time': start_time,
                'end_time': end_time,
                'point_names': query_point_str,
                'group_names': group_names,
                'output_file': query_config.get('output_file'),
                'by_what_time': query_config.get('by_what_time'),  # 支持自定义时间字段查询
                'aux_queries': aux_query_str  # 支持附加查询条件
            }
            
        except ConnectionError as e:
            self.logger.warning("读取查询参数时 OPC UA 不可用: %s: %s", type(e).__name__, e)
            return None
        except TimeoutError as e:
            self.logger.warning("读取查询参数时 OPC UA 超时: %s: %s", type(e).__name__, e)
            return None
        except OSError as e:
            if _is_opcua_transient(e):
                self.logger.warning("读取查询参数时 OPC UA 网络错误: %s: %s", type(e).__name__, e)
                return None
            self.logger.error(f"读取查询参数失败：{e}", exc_info=True)
            return None
        except Exception as e:
            self.logger.error(f"读取查询参数失败：{e}", exc_info=True)
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
