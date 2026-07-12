"""
数据采集器
负责根据配置定时或触发式采集数据
"""

import asyncio
import logging
import sys
import os
import time
from typing import Dict, List, Callable, Any, Iterator, Optional, Set, Tuple
from datetime import datetime, timedelta
from collections import Counter

# 处理相对导入问题
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config_models import DataGroup, DataPoint, TriggerType
from communication.opcua_client import OpcUaClient
from communication.communication_manager import CommunicationManager


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
        self.trigger_reset_confirm_attempts = 3
        self.trigger_reset_confirm_delay = 0.05
        self.trigger_stuck_reset_retry_interval = 1.0
        self.metrics: Counter[str] = Counter()

    async def _read_boolean_trigger_value(
        self,
        trigger_point: DataPoint,
        opcua_client: OpcUaClient,
    ) -> Any:
        try:
            trigger_data = await opcua_client.read_data_points([trigger_point])
            return trigger_data.get(trigger_point.name, {}).get('value')
        except Exception as exc:  # noqa: BLE001
            self.logger.warning(
                "读取触发点 %s 用于复位确认失败: %s",
                trigger_point.name,
                exc,
            )
            return None

    @staticmethod
    def _is_false_trigger_value(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip().lower() in {"false", "0", "off", ""}
        return value is False or value == 0

    @staticmethod
    def _create_fixed_cadence_anchor(
        now_wall: datetime,
        now_monotonic: float,
    ) -> tuple[float, datetime]:
        anchor_wall = now_wall.replace(microsecond=0)
        anchor_monotonic = now_monotonic - (now_wall - anchor_wall).total_seconds()
        return anchor_monotonic, anchor_wall

    @staticmethod
    def _fixed_cadence_deadline(
        anchor_monotonic: float,
        tick_index: int,
        interval: float,
    ) -> float:
        return anchor_monotonic + tick_index * interval

    @staticmethod
    def _fixed_cadence_collection_time(
        anchor_wall: datetime,
        tick_index: int,
        interval: float,
    ) -> datetime:
        return anchor_wall + timedelta(seconds=tick_index * interval)

    @classmethod
    def _advance_fixed_cadence_tick(
        cls,
        anchor_monotonic: float,
        current_tick_index: int,
        interval: float,
        now_monotonic: float,
    ) -> tuple[int, int]:
        next_tick_index = current_tick_index + 1
        next_deadline = cls._fixed_cadence_deadline(
            anchor_monotonic,
            next_tick_index,
            interval,
        )
        lag = now_monotonic - next_deadline
        if lag < interval:
            return next_tick_index, 0

        skipped_ticks = int(lag // interval)
        return next_tick_index + skipped_ticks, skipped_ticks

    async def _reset_boolean_trigger_with_confirm(
        self,
        group: DataGroup,
        trigger_point: DataPoint,
        opcua_client: OpcUaClient,
        reason: str,
    ) -> bool:
        """
        将布尔触发点复位为 False，并读回确认。
        返回 True 表示已经确认 PLC/OPC UA 侧为 False，可恢复内部上升沿状态。
        """
        attempts = max(1, int(self.trigger_reset_confirm_attempts))
        delay = max(0.0, float(self.trigger_reset_confirm_delay))

        for attempt in range(1, attempts + 1):
            success = await opcua_client.write_boolean_value(trigger_point.path, False)
            if success and delay:
                await asyncio.sleep(delay)

            confirmed_value = await self._read_boolean_trigger_value(trigger_point, opcua_client)
            if success and self._is_false_trigger_value(confirmed_value):
                if attempt > 1 or reason != "上升沿采集后":
                    self.logger.info(
                        "触发点复位并确认成功: group=%s, point=%s, reason=%s, attempt=%s",
                        group.name,
                        trigger_point.name,
                        reason,
                        attempt,
                    )
                else:
                    self.logger.debug(f"已复位触发点：{trigger_point.name}")
                return True

            self.logger.warning(
                "触发点复位未确认: group=%s, point=%s, reason=%s, attempt=%s/%s, "
                "write_success=%s, readback=%r",
                group.name,
                trigger_point.name,
                reason,
                attempt,
                attempts,
                success,
                confirmed_value,
            )
            if attempt < attempts and delay:
                await asyncio.sleep(delay)

        self.logger.error(
            "触发点复位最终失败，后续上升沿可能被卡住: group=%s, point=%s, reason=%s",
            group.name,
            trigger_point.name,
            reason,
        )
        return False
    
    def _extract_parallel_point_values(
        self,
        group_name: str,
        point_name: str,
        point_data: Dict[str, Any],
        triggered_indices: List[int],
    ) -> Optional[Dict[str, Any]]:
        """
        从并行触发读取结果中提取与触发索引对齐的值列表。

        - 数组：按触发索引取值
        - 标量（如全局 BatchCode）：广播到每个触发索引
        - None：跳过该点
        """
        raw_value = point_data.get('value')
        if raw_value is None:
            self.logger.warning(
                f"并行触发组 {group_name} 数据点 {point_name} 值为 None，跳过该点"
            )
            return None

        if isinstance(raw_value, (list, tuple)):
            extracted = [raw_value[i] for i in triggered_indices if i < len(raw_value)]
        else:
            # 标量点（如当前批次号）广播到本次所有触发行
            extracted = [raw_value] * len(triggered_indices)
            self.logger.debug(
                "并行触发组 %s 数据点 %s 为标量，已广播到 %s 个触发索引",
                group_name,
                point_name,
                len(triggered_indices),
            )

        return {
            'value': extracted,
            'timestamp': point_data.get('timestamp'),
            'path': point_data.get('path'),
            'triggered_indices': triggered_indices,
        }

    def _build_parallel_rows(
        self,
        group: DataGroup,
        data_points: List[DataPoint],
        data: Dict[str, Dict[str, Any]],
        triggered_indices: List[int],
        trigger_point: DataPoint,
    ) -> Tuple[List[Dict[str, Any]], Dict[int, List[str]]]:
        """Build complete scalar rows and report every rejected trigger index.

        A trigger index is accepted only when every configured point has a non-None
        value for that index. Scalars are broadcast. Array values are never silently
        truncated: a short array rejects only the affected indices.
        """
        rows: List[Dict[str, Any]] = []
        rejected: Dict[int, List[str]] = {}
        now = datetime.now()
        for index in triggered_indices:
            row_data: Dict[str, Any] = {}
            errors: List[str] = []
            for point in data_points:
                point_data = data.get(point.name)
                if not isinstance(point_data, dict):
                    errors.append(f"{point.name}:missing")
                    continue
                raw_value = point_data.get("value")
                if raw_value is None:
                    errors.append(f"{point.name}:none")
                    continue
                if isinstance(raw_value, (list, tuple)):
                    if index >= len(raw_value):
                        errors.append(f"{point.name}:index_out_of_range({len(raw_value)})")
                        continue
                    value = raw_value[index]
                else:
                    value = raw_value
                if value is None:
                    errors.append(f"{point.name}:none_at_index")
                    continue
                row_data[point.name] = {
                    "value": value,
                    "timestamp": point_data.get("timestamp"),
                    "path": point_data.get("path") or point.path,
                }
            if errors:
                rejected[index] = errors
                continue
            rows.append(
                {
                    "group_name": group.name,
                    "collection_time": now,
                    "trigger_type": "variable",
                    "trigger_point": trigger_point.name,
                    "is_parallel": False,
                    "trigger_index": index,
                    "data": row_data,
                }
            )
        return rows, rejected

    async def _reset_parallel_triggers_with_confirm(
        self,
        group: DataGroup,
        trigger_point: DataPoint,
        current_values: List[Any],
        indices: Set[int],
        opcua_client: OpcUaClient,
        reason: str,
    ) -> Set[int]:
        """Reset selected array indices and return those confirmed False by readback."""
        if not indices:
            return set()
        attempts = max(1, int(self.trigger_reset_confirm_attempts))
        delay = max(0.0, float(self.trigger_reset_confirm_delay))
        desired = list(current_values)
        valid_indices = {index for index in indices if 0 <= index < len(desired)}
        for index in valid_indices:
            desired[index] = False
        remaining = set(valid_indices)
        for attempt in range(1, attempts + 1):
            success = await opcua_client.write_array_value(trigger_point.path, desired)
            if success and delay:
                await asyncio.sleep(delay)
            readback = await self._read_boolean_trigger_value(trigger_point, opcua_client)
            if isinstance(readback, (list, tuple)):
                confirmed = {
                    index
                    for index in remaining
                    if index < len(readback) and self._is_false_trigger_value(readback[index])
                }
                remaining -= confirmed
            if not remaining:
                self.metrics["parallel_trigger_reset_confirmed"] += len(valid_indices)
                return valid_indices
            self.logger.warning(
                "并行触发复位未完全确认: group=%s, point=%s, reason=%s, "
                "attempt=%s/%s, write_success=%s, remaining=%s",
                group.name,
                trigger_point.name,
                reason,
                attempt,
                attempts,
                success,
                sorted(remaining),
            )
            if attempt < attempts and delay:
                await asyncio.sleep(delay)
        self.metrics["parallel_trigger_reset_failed"] += len(remaining)
        return valid_indices - remaining

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
        for group in data_groups:
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

            else:
                self.logger.error("不支持的数据组触发类型: %s (%s)", group.trigger, group.name)

    
    async def stop_collection(self) -> None:
        """停止所有数据采集"""
        collectors = list(self.collectors.items())
        for name, task in collectors:
            task.cancel()
            self.logger.info(f"停止采集组: {name}")

        if collectors:
            results = await asyncio.gather(
                *(task for _, task in collectors),
                return_exceptions=True,
            )
            for (name, _), result in zip(collectors, results):
                if isinstance(result, BaseException) and not isinstance(result, asyncio.CancelledError):
                    self.logger.error("停止采集组 %s 时发生错误: %s", name, result, exc_info=result)
        self.collectors.clear()
    
    async def _time_triggered_collection(self, group: DataGroup, 
                                       data_points: List[DataPoint],
                                       opcua_client: OpcUaClient) -> None:
        """时间触发的数据采集。

        使用固定节拍调度：实际读取可以迟到，但 collection_time 使用计划节拍时间。
        例如计划 18s 采集，实际 18.6s 开始、19.1s 返回，入库时间仍写 18s。
        如果程序落后超过一个完整周期，只跳过已经错过的节拍，避免无限追赶。
        """
        interval = float(group.interval_seconds)
        anchor_monotonic, anchor_wall = self._create_fixed_cadence_anchor(
            datetime.now(),
            time.monotonic(),
        )
        tick_index = 0

        while True:
            try:
                next_deadline = self._fixed_cadence_deadline(
                    anchor_monotonic,
                    tick_index,
                    interval,
                )
                now = time.monotonic()
                wait = next_deadline - now
                if wait > 0:
                    await asyncio.sleep(wait)

                planned_collection_time = self._fixed_cadence_collection_time(
                    anchor_wall,
                    tick_index,
                    interval,
                )
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
                        'collection_time': planned_collection_time,
                        'trigger_type': 'time',
                        'data': valid_data
                    }

                    for callback in self.data_callbacks:
                        callback(collection_data)

                tick_index, skipped_ticks = self._advance_fixed_cadence_tick(
                    anchor_monotonic,
                    tick_index,
                    interval,
                    time.monotonic(),
                )
                if skipped_ticks:
                    self.logger.warning(
                        "采集组 %s 固定节拍落后，跳过 %s 个已错过节拍，下一计划时间=%s",
                        group.name,
                        skipped_ticks,
                        self._fixed_cadence_collection_time(
                            anchor_wall,
                            tick_index,
                            interval,
                        ),
                    )

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
                tick_index, skipped_ticks = self._advance_fixed_cadence_tick(
                    anchor_monotonic,
                    tick_index,
                    interval,
                    time.monotonic(),
                )
                if skipped_ticks:
                    self.logger.warning(
                        "采集组 %s 异常恢复后跳过 %s 个已错过节拍，下一计划时间=%s",
                        group.name,
                        skipped_ticks,
                        self._fixed_cadence_collection_time(
                            anchor_wall,
                            tick_index,
                            interval,
                        ),
                    )

    def _get_variable_trigger_poll_interval(self, group: DataGroup) -> float:
        """获取 variable 类触发模式的触发点轮询间隔（秒）。"""
        if group.trigger_interval_seconds is not None:
            return float(group.trigger_interval_seconds)
        return float(group.interval_seconds)

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
        interval = float(group.interval_seconds)
        trigger_interval = float(group.trigger_interval_seconds)
        anchor_monotonic, anchor_wall = self._create_fixed_cadence_anchor(
            datetime.now(),
            time.monotonic(),
        )
        tick_index = 0
        previous_trigger_state = None  # None 表示首次读取，只初始化不触发
        last_stuck_reset_attempt_at = 0.0

        async def do_time_collect(planned_collection_time: datetime) -> None:
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
                    'collection_time': planned_collection_time,
                    'trigger_type': 'time',
                    'data': valid_data,
                }
                for callback in self.data_callbacks:
                    callback(collection_data)
        async def collect_time_if_due() -> None:
            nonlocal tick_index
            next_deadline = self._fixed_cadence_deadline(
                anchor_monotonic,
                tick_index,
                interval,
            )
            if time.monotonic() < next_deadline:
                return

            planned_collection_time = self._fixed_cadence_collection_time(
                anchor_wall,
                tick_index,
                interval,
            )
            await do_time_collect(planned_collection_time)

            tick_index, skipped_ticks = self._advance_fixed_cadence_tick(
                anchor_monotonic,
                tick_index,
                interval,
                time.monotonic(),
            )
            if skipped_ticks:
                self.logger.warning(
                    "采集组 %s（time_and_variable 定时）固定节拍落后，跳过 %s 个已错过节拍，下一个计划时间=%s",
                    group.name,
                    skipped_ticks,
                    self._fixed_cadence_collection_time(
                        anchor_wall,
                        tick_index,
                        interval,
                    ),
                )

        while True:
            try:
                await collect_time_if_due()

                next_time_deadline = self._fixed_cadence_deadline(
                    anchor_monotonic,
                    tick_index,
                    interval,
                )
                until_next = next_time_deadline - time.monotonic()
                sleep_for = min(trigger_interval, max(0.001, until_next))
                await asyncio.sleep(sleep_for)

                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_value = trigger_data.get(trigger_point.name, {}).get('value', False)

                # 首次读取仅初始化状态，不触发采集
                if previous_trigger_state is None:
                    previous_trigger_state = current_trigger_value
                    continue

                update_previous_state = True
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
                        if group.reset_trigger_after_read:
                            update_previous_state = False
                            self.logger.warning(
                                "采集组 %s 本轮变量数据读取失败，保持触发内部状态为 False，下一周期继续重试读取",
                                group.name,
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
                            reset_confirmed = await self._reset_boolean_trigger_with_confirm(
                                group,
                                trigger_point,
                                opcua_client,
                                "上升沿采集后",
                            )
                            if reset_confirmed:
                                current_trigger_value = False
                                last_stuck_reset_attempt_at = 0.0
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

                elif group.reset_trigger_after_read and previous_trigger_state and current_trigger_value:
                    now_for_reset = time.monotonic()
                    if now_for_reset - last_stuck_reset_attempt_at >= self.trigger_stuck_reset_retry_interval:
                        last_stuck_reset_attempt_at = now_for_reset
                        self.logger.warning(
                            "触发点持续为 True，尝试补复位: group=%s, point=%s",
                            group.name,
                            trigger_point.name,
                        )
                        reset_confirmed = await self._reset_boolean_trigger_with_confirm(
                            group,
                            trigger_point,
                            opcua_client,
                            "触发点持续高电平",
                        )
                        if reset_confirmed:
                            current_trigger_value = False

                if update_previous_state:
                    previous_trigger_state = current_trigger_value

                await collect_time_if_due()

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
                tick_index, skipped_ticks = self._advance_fixed_cadence_tick(
                    anchor_monotonic,
                    tick_index,
                    interval,
                    time.monotonic(),
                )
                if skipped_ticks:
                    self.logger.warning(
                        "采集组 %s（time_and_variable 定时）异常恢复后跳过 %s 个已错过节拍，下一个计划时间=%s",
                        group.name,
                        skipped_ticks,
                        self._fixed_cadence_collection_time(
                            anchor_wall,
                            tick_index,
                            interval,
                        ),
                    )
    
    async def _variable_triggered_collection(self, group: DataGroup,
                                           data_points: List[DataPoint],
                                           trigger_point: DataPoint,
                                           opcua_client: OpcUaClient) -> None:
        """变量触发的数据采集 - 实现上升沿触发逻辑"""
        poll_interval = self._get_variable_trigger_poll_interval(group)
        # 记录上一次的触发点状态，用于检测上升沿
        previous_trigger_state = None  # None 表示首次读取，只初始化不触发
        last_stuck_reset_attempt_at = 0.0

        while True:
            try:
                # 检查触发点状态
                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_value = trigger_data.get(trigger_point.name, {}).get('value', False)

                # 首次读取仅初始化状态，不触发采集
                if previous_trigger_state is None:
                    previous_trigger_state = current_trigger_value
                    self.logger.debug(f"变量触发组 {group.name} 初始化触发状态: {current_trigger_value}")
                    await asyncio.sleep(poll_interval)
                    continue

                update_previous_state = True
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
                        if group.reset_trigger_after_read:
                            update_previous_state = False
                            self.logger.warning(
                                "变量触发组 %s 本轮数据读取失败，保持触发内部状态为 False，下一周期继续重试读取",
                                group.name,
                            )
                    else:
                        # 记录无效数据点（可选）
                        invalid_points = [name for name, info in data.items() if info.get('value') is None]
                        if invalid_points:
                            self.logger.warning(f"变量触发组 {group.name} 以下数据点读取失败，已过滤：{invalid_points}")
                                            
                        # 根据配置决定是否复位触发点
                        if group.reset_trigger_after_read:
                            reset_confirmed = await self._reset_boolean_trigger_with_confirm(
                                group,
                                trigger_point,
                                opcua_client,
                                "上升沿采集后",
                            )
                            if reset_confirmed:
                                current_trigger_value = False
                                last_stuck_reset_attempt_at = 0.0
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

                elif group.reset_trigger_after_read and previous_trigger_state and current_trigger_value:
                    now_for_reset = time.monotonic()
                    if now_for_reset - last_stuck_reset_attempt_at >= self.trigger_stuck_reset_retry_interval:
                        last_stuck_reset_attempt_at = now_for_reset
                        self.logger.warning(
                            "触发点持续为 True，尝试补复位: group=%s, point=%s",
                            group.name,
                            trigger_point.name,
                        )
                        reset_confirmed = await self._reset_boolean_trigger_with_confirm(
                            group,
                            trigger_point,
                            opcua_client,
                            "触发点持续高电平",
                        )
                        if reset_confirmed:
                            current_trigger_value = False
                
                # 更新上一次的状态
                if update_previous_state:
                    previous_trigger_state = current_trigger_value
                
                # 短暂等待后继续检查
                await asyncio.sleep(poll_interval)
                
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
        """并行变量触发的数据采集 - trigger_point 为布尔数组；
        data_points 可为数组（按索引取值）或标量（广播到每个触发索引）。"""
        poll_interval = self._get_variable_trigger_poll_interval(group)
        previous_trigger_state = None
        pending_reset_indices: Set[int] = set()

        while True:
            try:
                # 读取触发点数组
                trigger_data = await opcua_client.read_data_points([trigger_point])
                current_trigger_values = trigger_data.get(trigger_point.name, {}).get('value')

                if current_trigger_values is None:
                    self.logger.warning(f"并行触发组 {group.name} 读取触发点失败")
                    await asyncio.sleep(poll_interval)
                    continue

                # 首次读取仅初始化状态，不触发
                if previous_trigger_state is None:
                    previous_trigger_state = list(current_trigger_values)
                    self.logger.info(f"并行触发组 {group.name} 初始化触发状态，数组长度={len(current_trigger_values)}")
                    await asyncio.sleep(poll_interval)
                    continue

                if len(previous_trigger_state) != len(current_trigger_values):
                    self.logger.warning(
                        "并行触发组 %s 触发数组长度变化: previous=%s, current=%s，重新初始化状态",
                        group.name,
                        len(previous_trigger_state),
                        len(current_trigger_values),
                    )
                    previous_trigger_state = list(current_trigger_values)
                    pending_reset_indices = {
                        index for index in pending_reset_indices if index < len(current_trigger_values)
                    }
                    await asyncio.sleep(poll_interval)
                    continue

                # Accepted rows whose acknowledgement previously failed must not be
                # collected twice; keep retrying only their PLC reset.
                stuck_pending = {
                    index
                    for index in pending_reset_indices
                    if index < len(current_trigger_values) and current_trigger_values[index]
                }
                if stuck_pending:
                    confirmed = await self._reset_parallel_triggers_with_confirm(
                        group,
                        trigger_point,
                        list(current_trigger_values),
                        stuck_pending,
                        opcua_client,
                        "已入队触发持续高电平",
                    )
                    pending_reset_indices -= confirmed
                    for index in confirmed:
                        current_trigger_values[index] = False
                        previous_trigger_state[index] = False

                # 检测上升沿索引
                triggered_indices = []
                for i, (prev, curr) in enumerate(zip(previous_trigger_state, current_trigger_values)):
                    if not prev and curr:
                        triggered_indices.append(i)

                if triggered_indices:
                    self.logger.info(f"并行触发组 {group.name} 检测到上升沿，触发索引: {triggered_indices}")

                    self.metrics["parallel_edges_detected"] += len(triggered_indices)
                    # Read once, then validate every trigger index independently.
                    data = await opcua_client.read_data_points(data_points)
                    rows, rejected = self._build_parallel_rows(
                        group, data_points, data, triggered_indices, trigger_point
                    )
                    accepted_indices: Set[int] = set()
                    for row in rows:
                        try:
                            for callback in self.data_callbacks:
                                callback(row)
                        except Exception as exc:
                            index = int(row["trigger_index"])
                            rejected.setdefault(index, []).append(f"callback:{exc}")
                            self.logger.error(
                                "并行触发组 %s 索引 %s 入队回调失败，不确认触发: %s",
                                group.name,
                                index,
                                exc,
                                exc_info=True,
                            )
                        else:
                            accepted_indices.add(int(row["trigger_index"]))

                    self.metrics["parallel_rows_accepted"] += len(accepted_indices)
                    self.metrics["parallel_rows_rejected"] += len(rejected)
                    for index, reasons in sorted(rejected.items()):
                        self.logger.warning(
                            "并行触发组 %s 索引 %s 数据不完整，不入队且不复位: %s",
                            group.name,
                            index,
                            reasons,
                        )

                    if group.reset_trigger_after_read and accepted_indices:
                        confirmed = await self._reset_parallel_triggers_with_confirm(
                            group,
                            trigger_point,
                            list(current_trigger_values),
                            accepted_indices,
                            opcua_client,
                            "完整数据已进入内存队列",
                        )
                        pending_reset_indices |= accepted_indices - confirmed
                        for index in confirmed:
                            current_trigger_values[index] = False

                    # Rejected indices deliberately retain the pre-edge False state,
                    # so a still-high PLC bit is retried on the next poll.
                    next_previous = list(current_trigger_values)
                    for index in rejected:
                        if index < len(next_previous):
                            next_previous[index] = False
                    for index in pending_reset_indices:
                        if index < len(next_previous):
                            next_previous[index] = True
                    previous_trigger_state = next_previous
                else:
                    previous_trigger_state = list(current_trigger_values)

                await asyncio.sleep(poll_interval)

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

