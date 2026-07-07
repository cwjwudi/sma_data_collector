"""
OPC UA通信客户端
负责与OPC UA服务器建立连接并读取数据
"""

import asyncio
import logging
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
from opcua import Client, ua
# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config_models import DataPoint


class OpcUaClient:
    """OPC UA客户端类 - 支持自动重连"""
    
    def __init__(self, server_url: str, 
                 max_retries: int = 1000, 
                 retry_delay: float = 5.0,
                 health_check_interval: int = 30):
        """
        初始化 OPC UA 客户端
        
        Args:
            server_url: OPC UA 服务器地址
            max_retries: 兼容旧参数；当前版本不会因达到次数上限而停止后台重连
            retry_delay: 重试延迟时间 (秒)，固定为 5 秒
            health_check_interval: 健康检查间隔 (秒)
        """
        self.server_url = server_url
        self.client: Optional[Client] = None
        self.connected = False
        self.logger = logging.getLogger(__name__)
        
        # 重连配置
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.health_check_interval = health_check_interval
        
        # 重连状态
        self.current_retry_count = 0
        self.is_reconnecting = False
        self._reconnect_lock = asyncio.Lock()
        self.health_check_task: Optional[asyncio.Task] = None
        self.log_throttle_interval = max(
            1.0,
            float(os.getenv("SD_SMA_OPCUA_LOG_THROTTLE_INTERVAL", "30")),
        )
        self._last_reconnect_failure_log_at = 0.0
        self._suppressed_reconnect_failures = 0
        self._last_write_failure_log_at: Dict[str, float] = {}
        self._suppressed_write_failures: Dict[str, int] = {}
    
    async def _ensure_connected(self) -> bool:
        """若已连接则直接返回 True，否则尝试重连（避免与 health check / 断线竞态导致 client 为 None）。"""
        if self.connected and self.client is not None:
            return True
        return await self._attempt_reconnect()
    
    async def connect(self) -> bool:
        """
        连接到OPC UA服务器
        
        Returns:
            bool: 连接是否成功
        """
        try:
            self.client = Client(self.server_url)
            self.client.connect()
            self.connected = True
            self.current_retry_count = 0  # 重置重试计数
            self.logger.info(f"成功连接到OPC UA服务器: {self.server_url}")
            return True
        except Exception as e:
            if self._is_transient_connect_failure(e):
                self.logger.warning(
                    "连接OPC UA服务器失败，后台将继续重连: %s: %s",
                    type(e).__name__,
                    e,
                )
            else:
                self.logger.error(f"连接OPC UA服务器失败: {e}", exc_info=True)
            self.connected = False
            self.client = None
            return False
        finally:
            # 即使首次连接失败，也启动后台健康检查/重连任务，支持 PLC 晚启动。
            await self._start_health_check()
    
    async def disconnect(self) -> None:
        """断开OPC UA服务器连接"""
        # 停止健康检查任务
        await self._stop_health_check()
        
        if self.client:
            try:
                # 在单独的线程中执行阻塞的disconnect操作
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self.client.disconnect)
                self.logger.info("已断开OPC UA服务器连接")
            except Exception as e:
                self.logger.error(f"断开连接时发生错误: {e}", exc_info=True)
            finally:
                self.connected = False
                self.client = None
                self.is_reconnecting = False
        else:
            self.connected = False
            self.is_reconnecting = False
    
    async def _read_data_points_sequential(
        self, data_points: List[DataPoint], timestamp: datetime
    ) -> Dict[str, Any]:
        """逐点读取（批量失败时的回退路径，行为与历史版本一致）。"""
        results: Dict[str, Any] = {}

        def _fill_remaining(start_idx: int, error_message: str) -> None:
            for p in data_points[start_idx:]:
                if p.name in results:
                    continue
                results[p.name] = {
                    "value": None,
                    "timestamp": timestamp,
                    "error": error_message,
                    "path": p.path,
                }

        if not await self._ensure_connected():
            self.logger.warning(
                "OPC UA 未连接，跳过逐点读取（%d 个数据点）",
                len(data_points),
            )
            _fill_remaining(0, "OPC UA 未连接")
            return results

        for idx, point in enumerate(data_points):
            if not self.client or not self.connected:
                if not await self._ensure_connected():
                    self.logger.warning(
                        "逐点读取中断：客户端不可用，剩余 %d 个数据点跳过",
                        len(data_points) - idx,
                    )
                    _fill_remaining(
                        idx,
                        "OPC UA 客户端不可用（可能已断开或正在重连）",
                    )
                    break

            try:
                node = self.client.get_node(point.path)
                value = node.get_value()
                results[point.name] = {
                    'value': value,
                    'timestamp': timestamp,
                    'path': point.path
                }
                self.logger.debug(f"读取数据点 {point.name}: {value}")
            except Exception as e:
                conn_err = self._is_connection_error(e)
                if conn_err:
                    self.logger.warning(
                        "读取数据点 %s 时连接异常: %s",
                        point.name,
                        e,
                    )
                    if await self._attempt_reconnect():
                        await asyncio.sleep(2.0)
                        try:
                            if not self.client:
                                raise ConnectionError("重连后客户端仍不可用")
                            node = self.client.get_node(point.path)
                            value = node.get_value()
                            results[point.name] = {
                                'value': value,
                                'timestamp': timestamp,
                                'path': point.path
                            }
                            self.logger.info(
                                "重连后成功读取数据点 %s", point.name
                            )
                        except Exception as retry_e:
                            self.logger.warning(
                                "重连后读取数据点 %s 仍失败: %s",
                                point.name,
                                retry_e,
                            )
                            results[point.name] = {
                                'value': None,
                                'timestamp': timestamp,
                                'error': str(retry_e),
                                'path': point.path
                            }
                            self.logger.warning(
                                "停止逐点读取，跳过剩余 %d 个数据点",
                                len(data_points) - idx - 1,
                            )
                            _fill_remaining(
                                idx + 1,
                                "前序点读取失败，已中止本轮逐点读取",
                            )
                            break
                    else:
                        await asyncio.sleep(3.0)
                        results[point.name] = {
                            'value': None,
                            'timestamp': timestamp,
                            'error': f"连接失败: {str(e)}",
                            'path': point.path
                        }
                        self.logger.warning(
                            "OPC UA 重连失败，跳过剩余 %d 个数据点",
                            len(data_points) - idx - 1,
                        )
                        _fill_remaining(idx + 1, "OPC UA 重连失败")
                        break
                else:
                    self.logger.error(
                        "读取数据点 %s 失败: %s", point.name, e, exc_info=True
                    )
                    results[point.name] = {
                        'value': None,
                        'timestamp': timestamp,
                        'error': str(e),
                        'path': point.path
                    }
        return results

    async def read_data_points(self, data_points: List[DataPoint]) -> Dict[str, Any]:
        """
        读取多个数据点的值

        优先使用 OPC UA 一次往返批量读取（Client.get_values）；失败时回退为逐点读取。
        
        Args:
            data_points: 数据点列表
            
        Returns:
            Dict[str, Any]: 数据点名称到值的映射
        """
        if not await self._ensure_connected():
            raise ConnectionError("OPC UA客户端连接失败且无法重连")

        if not data_points:
            return {}

        timestamp = datetime.now()

        async def try_batch_read() -> Optional[Dict[str, Any]]:
            if not await self._ensure_connected():
                return None
            try:
                nodes = [self.client.get_node(p.path) for p in data_points]
                values = self.client.get_values(nodes)
            except Exception as e:
                if self._is_connection_error(e):
                    self.logger.warning(f"批量读取遇连接错误，准备重连: {e}")
                    if await self._attempt_reconnect():
                        await asyncio.sleep(2.0)
                        try:
                            nodes = [self.client.get_node(p.path) for p in data_points]
                            values = self.client.get_values(nodes)
                        except Exception as retry_e:
                            self.logger.error(f"重连后批量读取仍失败: {retry_e}", exc_info=True)
                            return None
                    else:
                        await asyncio.sleep(3.0)
                        return None
                else:
                    self.logger.warning(f"批量读取失败，将回退逐点读取: {e}")
                    return None

            if len(values) != len(data_points):
                self.logger.error(
                    f"批量读取返回数量({len(values)})与请求({len(data_points)})不一致，回退逐点读取"
                )
                return None

            out: Dict[str, Any] = {}
            for point, value in zip(data_points, values):
                out[point.name] = {
                    'value': value,
                    'timestamp': timestamp,
                    'path': point.path
                }
                self.logger.debug(f"读取数据点 {point.name}: {value}")
            return out

        batch = await try_batch_read()
        if batch is not None:
            return batch

        return await self._read_data_points_sequential(data_points, timestamp)
    
    async def write_array_value(self, point_path: str, values: list) -> bool:
        """
        写入数组值到指定节点

        Args:
            point_path: 节点路径
            values: 要写入的数组值

        Returns:
            bool: 写入是否成功
        """
        # 检查连接状态，如果需要则尝试重连
        if not self.connected or not self.client:
            if not await self._attempt_reconnect():
                self.logger.error("写入失败：无法连接到OPC UA服务器")
                return False

        try:
            node = self.client.get_node(point_path)

            # 先检查节点是否可写
            try:
                node_attrs = node.get_attributes([
                    ua.AttributeIds.AccessLevel,
                    ua.AttributeIds.UserAccessLevel
                ])

                access_level = node_attrs[0].Value.Value if len(node_attrs) > 0 and node_attrs[0].Value else 0
                user_access_level = node_attrs[1].Value.Value if len(node_attrs) > 1 and node_attrs[1].Value else 0

                if not (access_level & 2) or not (user_access_level & 2):
                    self.logger.info(f"节点 {point_path} 不可写，跳过写入操作")
                    return False
            except Exception as attr_error:
                self.logger.debug(f"无法获取节点属性，继续尝试写入: {attr_error}")

            try:
                # 根据数组元素类型推断 VariantType
                if values and isinstance(values[0], bool):
                    variant_type = ua.VariantType.Boolean
                elif values and isinstance(values[0], int):
                    variant_type = ua.VariantType.Int64
                elif values and isinstance(values[0], float):
                    variant_type = ua.VariantType.Float
                else:
                    variant_type = ua.VariantType.Null

                node.set_attribute(
                    ua.AttributeIds.Value,
                    ua.DataValue(ua.Variant(values, variant_type))
                )
                self.logger.debug(f"成功写入数组值到 {point_path}, 长度={len(values)}")
                return True
            except Exception as write_error:
                error_str = str(write_error)
                if "BadWriteNotSupported" in error_str or "not support writing" in error_str.lower():
                    self.logger.info(f"服务器不支持写入操作: {point_path}")
                    return False
                else:
                    self.logger.warning(f"写入数组失败: {write_error}")
                    return False

        except Exception as e:
            if self._is_connection_error(e):
                self.logger.warning(f"写入数组时检测到连接错误，准备重连: {e}")
                if await self._attempt_reconnect():
                    return await self.write_array_value(point_path, values)
                else:
                    self.logger.error(f"写入数组失败且无法重连: {e}", exc_info=True)
                    return False
            else:
                self.logger.error(f"写入数组值到 {point_path} 失败: {e}", exc_info=True)
                return False

    async def write_boolean_value(self, point_path: str, value: bool) -> bool:
        """
        写入布尔值到指定节点
        
        Args:
            point_path: 节点路径
            value: 布尔值
            
        Returns:
            bool: 写入是否成功
        """
        return await self.write_scalar_value(point_path, value, ua.VariantType.Boolean, "布尔值")
    
    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self.connected and self.client is not None
    
    def _is_connection_error(self, error: Exception) -> bool:
        """
        判断是否为连接相关的错误
        
        Args:
            error: 异常对象
            
        Returns:
            bool: 是否为连接错误
        """
        # 健康检查/重连与采集并发时，可能出现 client 已被置空仍进入读取
        if isinstance(error, AttributeError):
            msg = str(error).lower()
            if "nonetype" in msg and "get_node" in msg:
                return True
        error_str = str(error).lower()
        connection_keywords = [
            'connection', 'connect', 'disconnected', 'closed',
            'timeout', 'network', 'socket', 'winerror 10054',
            'forcibly closed', 'broken pipe'
        ]
        return any(keyword in error_str for keyword in connection_keywords)

    def _is_transient_connect_failure(self, error: BaseException) -> bool:
        """
        断连、手动关 PLC、对端不可达等场景下常见的可恢复错误。
        此类错误只打简要日志，避免 ERROR+完整堆栈刷屏。
        """
        if isinstance(error, (TimeoutError, asyncio.TimeoutError, ConnectionError)):
            return True
        if isinstance(error, OSError):
            code = getattr(error, "errno", None)
            if code in {10054, 10053, 10051, 10050, 10060, 10061, 110, 111, 113}:
                return True
            return self._is_connection_error(error)
        if isinstance(error, Exception):
            return self._is_connection_error(error)
        return False
    
    async def _attempt_reconnect(self, *, wait_before_attempt: bool = True) -> bool:
        """
        尝试重新连接到OPC UA服务器
        
        Returns:
            bool: 重连是否成功
        """
        if self.is_connected():
            return True

        if self._reconnect_lock.locked():
            self.logger.debug("已在重连过程中，等待当前重连结果")

        async with self._reconnect_lock:
            if self.is_connected():
                return True

            self.is_reconnecting = True

            try:
                self.current_retry_count += 1
                delay = self.retry_delay
                if wait_before_attempt:
                    self.logger.debug(f"第 {self.current_retry_count} 次重连尝试，等待 {delay:.1f} 秒后重连")
                    await asyncio.sleep(delay)
                else:
                    self.logger.debug(f"第 {self.current_retry_count} 次重连尝试")

                # 断开现有连接（如果存在）
                if self.client:
                    try:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, self.client.disconnect)
                    except Exception:
                        pass  # 忽略断开连接时的错误
                    finally:
                        self.client = None
                        self.connected = False

                # 尝试重新连接
                self.client = Client(self.server_url)
                self.client.connect()
                self.connected = True
                if self._suppressed_reconnect_failures:
                    self.logger.info(
                        "OPC UA 重连恢复，之前合并了 %d 次失败日志",
                        self._suppressed_reconnect_failures,
                    )
                self._last_reconnect_failure_log_at = 0.0
                self._suppressed_reconnect_failures = 0
                self.logger.info(f"重连成功，已连接到 {self.server_url}")

                # 重置重试计数
                self.current_retry_count = 0

                await self._start_health_check()
                return True

            except Exception as e:
                self._log_reconnect_failure(e)
                self.connected = False
                self.client = None
                await self._start_health_check()
                return False
            finally:
                self.is_reconnecting = False
    
    async def _start_health_check(self) -> None:
        """启动健康检查任务"""
        if self.health_check_interval <= 0 and self.retry_delay <= 0:
            return

        if self.health_check_task and not self.health_check_task.done():
            return

        self.health_check_task = asyncio.create_task(
            self._health_check_loop(),
            name=f"opcua_health_{self.server_url}",
        )
        self.logger.debug(
            "已启动健康检查任务，连接正常间隔: %s 秒，断线重连间隔: %.1f 秒",
            self.health_check_interval,
            self.retry_delay,
        )
    
    async def _stop_health_check(self) -> None:
        """停止健康检查任务"""
        if self.health_check_task and not self.health_check_task.done():
            if self.health_check_task is asyncio.current_task():
                self.health_check_task = None
                return
            self.health_check_task.cancel()
            try:
                await self.health_check_task
            except asyncio.CancelledError:
                pass
            self.health_check_task = None
            self.logger.debug("已停止健康检查任务")
    
    async def _health_check_loop(self) -> None:
        """健康检查循环"""
        while True:
            try:
                interval = self.health_check_interval if self.is_connected() else self.retry_delay
                await asyncio.sleep(max(0.1, float(interval)))

                if self.connected and self.client:
                    # 尝试读取一个简单的节点来检查连接状态
                    try:
                        # 这里可以读取一个已知存在的节点或者使用服务器状态节点
                        server_state_node = self.client.get_node("i=2259")  # ServerState节点
                        server_state_node.get_value()
                        self.logger.debug("健康检查: 连接正常")
                    except Exception as e:
                        self.logger.warning(f"健康检查发现连接异常: {e}")
                        if self._is_connection_error(e):
                            self.connected = False
                            # 触发重连
                            self.logger.info("健康检查触发自动重连")
                            await self._attempt_reconnect(wait_before_attempt=False)
                else:
                    # 如果未连接，尝试重连
                    if not self.is_reconnecting:
                        self.logger.debug("健康检查发现未连接，尝试重连")
                        await self._attempt_reconnect(wait_before_attempt=False)
                        
            except asyncio.CancelledError:
                self.logger.debug("健康检查任务被取消")
                break
            except Exception as e:
                self.logger.error(f"健康检查过程中发生错误: {e}", exc_info=True)

    def _take_throttled_log(
        self,
        last_log_at: Dict[str, float],
        suppressed: Dict[str, int],
        key: str,
    ) -> tuple[bool, int]:
        now = time.monotonic()
        last = last_log_at.get(key, 0.0)
        if not last or now - last >= self.log_throttle_interval:
            suppressed_count = suppressed.pop(key, 0)
            last_log_at[key] = now
            return True, suppressed_count

        suppressed[key] = suppressed.get(key, 0) + 1
        return False, 0

    def _log_reconnect_failure(self, error: BaseException) -> None:
        now = time.monotonic()
        if (
            self._last_reconnect_failure_log_at
            and now - self._last_reconnect_failure_log_at < self.log_throttle_interval
        ):
            self._suppressed_reconnect_failures += 1
            self.logger.debug(
                "重连失败（已合并日志）: %s: %s",
                type(error).__name__,
                error,
            )
            return

        suppressed = self._suppressed_reconnect_failures
        self._suppressed_reconnect_failures = 0
        self._last_reconnect_failure_log_at = now
        suffix = f"（期间合并 {suppressed} 次同类失败）" if suppressed else ""
        if self._is_transient_connect_failure(error):
            self.logger.warning(
                "重连失败（服务器不可达或已断开）%s: %s: %s",
                suffix,
                type(error).__name__,
                error,
            )
        else:
            self.logger.error("重连失败%s: %s", suffix, error, exc_info=True)

    def _log_write_failure(
        self,
        point_path: str,
        value_label: str,
        error: BaseException,
        *,
        exc_info: bool = False,
    ) -> None:
        should_log, suppressed = self._take_throttled_log(
            self._last_write_failure_log_at,
            self._suppressed_write_failures,
            point_path,
        )
        if not should_log:
            self.logger.debug(
                "写入%s失败（已合并日志）: %s: %s",
                value_label,
                point_path,
                error,
            )
            return

        suffix = f"（期间合并 {suppressed} 次同类失败）" if suppressed else ""
        self.logger.warning(
            "写入%s失败%s: %s: %s",
            value_label,
            suffix,
            point_path,
            error,
            exc_info=exc_info,
        )

    async def write_scalar_value(self, point_path: str, value: Any, variant_type: Any, value_label: str = "值") -> bool:
        """写入单个 OPC UA 标量值，由客户端统一处理连接检查、重连与日志。"""
        if not self.connected or not self.client:
            if not await self._attempt_reconnect():
                self.logger.debug("写入%s跳过：OPC UA 未连接: %s", value_label, point_path)
                return False

        try:
            node = self.client.get_node(point_path)
            try:
                node_attrs = node.get_attributes([
                    ua.AttributeIds.AccessLevel,
                    ua.AttributeIds.UserAccessLevel,
                ])
                access_level = node_attrs[0].Value.Value if len(node_attrs) > 0 and node_attrs[0].Value else 0
                user_access_level = node_attrs[1].Value.Value if len(node_attrs) > 1 and node_attrs[1].Value else 0
                if not (access_level & 2) or not (user_access_level & 2):
                    self._log_write_failure(point_path, value_label, RuntimeError("节点不可写"))
                    return False
            except Exception as attr_error:
                self.logger.debug(f"无法获取节点属性，继续尝试写入: {attr_error}")

            node.set_attribute(ua.AttributeIds.Value, ua.DataValue(ua.Variant(value, variant_type)))
            self._last_write_failure_log_at.pop(point_path, None)
            suppressed = self._suppressed_write_failures.pop(point_path, 0)
            if suppressed:
                self.logger.info("OPC UA 写入恢复：%s，之前合并了 %d 次失败日志", point_path, suppressed)
            self.logger.debug("成功写入%s %s 到 %s", value_label, value, point_path)
            return True
        except Exception as e:
            if self._is_connection_error(e):
                self.connected = False
                self._log_write_failure(point_path, value_label, e)
                if await self._attempt_reconnect():
                    return await self.write_scalar_value(point_path, value, variant_type, value_label)
                return False

            error_str = str(e)
            if "BadWriteNotSupported" in error_str or "not support writing" in error_str.lower():
                self._log_write_failure(point_path, value_label, e)
                return False

            self._log_write_failure(point_path, value_label, e, exc_info=True)
            return False

    async def write_uint16_value(self, point_path: str, value: int) -> bool:
        """写入 UInt16 标量值。"""
        if value < 0 or value > 0xFFFF:
            self.logger.error("UInt16 写入值越界: %s", value)
            return False
        return await self.write_scalar_value(point_path, value, ua.VariantType.UInt16, "UInt16")
