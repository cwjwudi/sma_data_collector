"""
OPC UA 数据写入器
负责将查询结果写入 OPC UA 服务器的缓冲区，同时支持发送到 HTTP 服务器
"""

import logging
from typing import List, Dict, Any
from datetime import datetime
from opcua import ua
# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from communication.opcua_client import OpcUaClient
from communication.http_client import HttpClient
from communication.date_and_time import fast_dt_to_date_and_time


class OpcUaDataWriter:
    """OPC UA 数据写入器类"""
    
    # 查询状态码常量定义
    QUERY_STATUS_IDLE = 0  # 空闲/无查询
    QUERY_STATUS_RUNNING = 1  # 正在查询
    QUERY_STATUS_SUCCESS = 2  # 查询成功
    QUERY_STATUS_NO_DATA = 3  # 无查询数据返回
    QUERY_STATUS_ERROR = 4  # 其他错误
    
    def __init__(self, opcua_client: OpcUaClient, query_group_config = None, http_client: HttpClient = None):
        """
        初始化 OPC UA 数据写入器
        
        Args:
            opcua_client: OPC UA 客户端实例
            query_group_config: 查询组的配置对象（DataGroup），用于获取缓冲区配置
            http_client: HTTP 客户端实例（可选）
        """
        self.opcua_client = opcua_client
        self.http_client = http_client
        self.logger = logging.getLogger(__name__)
        self.query_group_config = query_group_config
        
        # 从配置中读取缓冲区节点配置（如果提供了配置）
        if query_group_config:
            self.buffer_nodes = query_group_config.get_buffer_nodes()
            self.time_nodes = query_group_config.get_time_nodes()
            self.feed_back_nodes = query_group_config.get_feed_back_nodes()
            self.cmd_next_nodes = query_group_config.get_cmd_next_nodes()
            self.buffer_size = query_group_config.get_buffer_size()
            self.feed_back_point = query_group_config.get_feed_back_point()
        else:
            # 向后兼容：使用默认配置
            self.buffer_nodes = [
                'ns=6;s=::DataRev:stDbReadQuery.stRev[0].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[1].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[2].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[3].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[4].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[5].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[6].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[7].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[8].rRevBuffer',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[9].rRevBuffer',
            ]

            self.time_nodes = [
                'ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[1].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[2].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[3].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[4].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[5].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[6].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[7].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[8].udiRevTime',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[9].udiRevTime',
            ]

            self.feed_back_nodes = [
                'ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[1].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[2].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[3].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[4].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[5].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[6].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[7].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[8].udiRevFeedBack',
                'ns=6;s=::DataRev:stDbReadQuery.stRev[9].udiRevFeedBack',
            ]

            self.cmd_next_nodes = [
                'ns=6;s=::DataRev:stDbReadQuery.stCmd.bNext'
            ]

            self.buffer_size = 10000  # 每个缓冲区的长度
            self.feed_back_point = None  # 默认无反馈点
    
    async def write_query_results(self, 
                                  query_results: List[List[Any]],
                                  query_time: List[List[Any]],
                                  point_names: List[str]) -> bool:
        """
        将查询结果写入 OPC UA 缓冲区并发送到 HTTP 服务器（根据 output_mode 配置）
        支持分批传输，当数据量超过 buffer_size 时，分多次写入
            
        Args:
            query_results: 查询结果列表
            point_names: 数据点名称列表
                
        Returns:
            bool: 写入是否成功
        """
        try:
            if not query_results:
                self.logger.debug("查询结果为空，跳过写入")
                return True
                
            # 计算总数据量
            total_records = sum(len(buffer_data) for buffer_data in query_results)
            self.logger.info(f"查询结果总计 {total_records} 条记录")
            
            # 判断是否需要分批传输
            max_batch_size = self.buffer_size
            needs_batching = any(len(buffer_data) > max_batch_size for buffer_data in query_results)
            
            if needs_batching:
                self.logger.info(f"数据量超过缓冲区限制 ({max_batch_size})，启动分批传输模式")
                return await self._write_query_results_batched(query_results, query_time, point_names)
            else:
                # 不需要分批，直接写入
                return await self._write_to_opcua_buffers(query_results, query_time, point_names)
                
        except Exception as e:
            self.logger.error(f"写入查询结果失败：{e}", exc_info=True)
            return False
    
    async def _write_to_opcua_buffers(self,
                                     query_results: List[List[Any]],
                                     query_time: List[List[Any]],
                                     point_names: List[str]) -> bool:
        """
        将查询结果写入 OPC UA 缓冲区（原有逻辑）
        """
        try:
            if not self.opcua_client.is_connected():
                self.logger.error("OPC UA 客户端未连接，无法写入数据")
                return False
                
            # 数据依次写入各个缓冲区（汇总日志）
            buffer_success_count = 0
            buffer_data_empty_count = 0
            buffer_failures: List[int] = []
            for i, buffer_node in enumerate(self.buffer_nodes):
                if i < len(query_results):
                    # 截断超出部分
                    data_to_write = query_results[i][:self.buffer_size]
                    # 如果数据为空，跳过写入
                    if len(data_to_write) == 0:
                        buffer_data_empty_count += 1
                        continue
                    # 如果数据不足 10000 个，用 0.0 填充
                    if len(data_to_write) < self.buffer_size:
                        data_to_write.extend([0.0] * (self.buffer_size - len(data_to_write)))
                        
                    # 写入数据
                    success = await self._write_to_node(
                        buffer_node,
                        data_to_write,
                        ua.VariantType.Float,
                        log_success=False
                    )
                    if success:
                        buffer_success_count += 1
                    else:
                        self.logger.warning(f"写入缓冲区 {i+1} 失败：{buffer_node}")
                        buffer_failures.append(i + 1)
                else:
                    buffer_data_empty_count += 1
                
            self.logger.info(
                f"缓冲区写入完成: 成功 {buffer_success_count}/{len(self.buffer_nodes)}"
                f"（无数据跳过: {buffer_data_empty_count}）"
            )
            if buffer_failures:
                self.logger.warning(f"缓冲区写入失败索引: {buffer_failures}")
    
            # 写入时间缓冲区（汇总日志）
            time_success_count = 0
            time_data_empty_count = 0
            time_failures: List[int] = []
            for i, time_node in enumerate(self.time_nodes):
                if i < len(query_time):
                    # 截断超出部分
                    time_to_write = query_time[i][:self.buffer_size]
    
                    # 修改时间格式为 UINT32
                    time_to_write = [fast_dt_to_date_and_time(t) for t in time_to_write]
                    if len(time_to_write) == 0:
                        time_data_empty_count += 1
                        continue
                        
                    # 如果数据不足 1000 个，用 0 填充
                    if len(time_to_write) < self.buffer_size:
                        time_to_write.extend([0] * (self.buffer_size - len(time_to_write)))
    
                    # 写入数据
                    success = await self._write_to_node(
                        time_node,
                        time_to_write,
                        ua.VariantType.UInt32,
                        log_success=False
                    )
                    if success:
                        time_success_count += 1
                    else:
                        self.logger.warning(f"写入时间缓冲区 {i+1} 失败：{time_node}")
                        time_failures.append(i + 1)
                else:
                    time_data_empty_count += 1
            self.logger.info(
                f"时间缓冲区写入完成: 成功 {time_success_count}/{len(self.time_nodes)}"
                f"（无数据跳过: {time_data_empty_count}）"
            )
            if time_failures:
                self.logger.warning(f"时间缓冲区写入失败索引: {time_failures}")
    
            # 写入反馈数据（实际写入的数据数量）
            feedback_success_count = 0
            feedback_zero_count = 0
            feedback_failures: List[int] = []
            for i, feed_back_node in enumerate(self.feed_back_nodes):
                if i < len(query_results):
                    # 获取实际数据量
                    actual_data_count = len(query_results[i])
                    
                    # 写入实际数据量作为反馈
                    success = await self._write_to_node(
                        feed_back_node,
                        [actual_data_count],
                        ua.VariantType.UInt32,
                        log_success=False
                    )
                    if success:
                        feedback_success_count += 1
                    else:
                        feedback_failures.append(i + 1)
                else:
                    # 如果没有对应的数据，写入 0
                    success = await self._write_to_node(
                        feed_back_node,
                        [0],
                        ua.VariantType.UInt32,
                        log_success=False
                    )
                    if success:
                        feedback_success_count += 1
                        feedback_zero_count += 1
                    else:
                        feedback_failures.append(i + 1)
            
            self.logger.info(
                f"反馈写入完成: 成功 {feedback_success_count}/{len(self.feed_back_nodes)}"
                f"（无数据置0: {feedback_zero_count}）"
            )
            if feedback_failures:
                self.logger.warning(f"反馈节点写入失败索引: {feedback_failures}")
                
            return buffer_success_count > 0
                
        except Exception as e:
            self.logger.error(f"写入 OPC UA 缓冲区失败：{e}", exc_info=True)
            return False
    
    async def _write_query_results_batched(self,
                                          query_results: List[List[Any]],
                                          query_time: List[List[Any]],
                                          point_names: List[str]) -> bool:
        """
        分批写入查询结果到 OPC UA 缓冲区
        
        工作流程：
        1. 计算总数据量和总批次数
        2. 首先写入第一批数据（最多 buffer_size 条）
        3. 写入反馈信息（剩余待发送数据量 = 总量 - 已发送量）
        4. 等待 PLC 的 bNext 上升沿信号
        5. 写入下一批数据，更新反馈值（递减）
        6. 重复步骤 4-5 直到所有数据传输完成
        
        Args:
            query_results: 查询结果列表
            query_time: 查询时间列表
            point_names: 数据点名称列表
            
        Returns:
            bool: 是否全部传输成功
        """
        try:
            # 计算每个缓冲区的总数据量
            total_counts_per_buffer = [len(buffer_data) for buffer_data in query_results]
            total_records = sum(total_counts_per_buffer)
            
            # 计算每个缓冲区需要的批次数
            batch_counts = []
            max_batches = 0
            for i, buffer_data in enumerate(query_results):
                batches_for_this_buffer = (len(buffer_data) + self.buffer_size - 1) // self.buffer_size
                batch_counts.append(batches_for_this_buffer)
                max_batches = max(max_batches, batches_for_this_buffer)
            
            self.logger.info(f"需要分批传输，总计 {total_records} 条记录，最大批次数：{max_batches}, 各缓冲区批次数：{batch_counts}")
            
            # 记录已发送的数据量（用于计算剩余量）
            sent_counts_per_buffer = [0] * len(query_results)
            
            # 逐批传输
            for batch_idx in range(max_batches):
                self.logger.info(f"开始传输第 {batch_idx + 1}/{max_batches} 批数据")
                
                # 准备当前批次的数据
                current_batch_data = []
                current_batch_time = []
                
                for i, buffer_data in enumerate(query_results):
                    start_idx = batch_idx * self.buffer_size
                    end_idx = min(start_idx + self.buffer_size, len(buffer_data))
                    
                    if start_idx < len(buffer_data):
                        batch_slice = buffer_data[start_idx:end_idx]
                        current_batch_data.append(batch_slice)
                        current_batch_time.append(query_time[i][start_idx:end_idx])
                        # 更新已发送量
                        sent_counts_per_buffer[i] += len(batch_slice)
                    else:
                        # 该缓冲区已无数据
                        current_batch_data.append([])
                        current_batch_time.append([])
                
                # 写入当前批次数据
                success = await self._write_batch_to_buffers(current_batch_data, current_batch_time, batch_idx, max_batches, 
                                                            total_counts_per_buffer, sent_counts_per_buffer)
                
                if not success:
                    self.logger.error(f"第 {batch_idx + 1} 批数据传输失败")
                    return False
                
                # 如果不是最后一批，等待 PLC 的 Next 信号
                if batch_idx < max_batches - 1:
                    self.logger.info(f"等待 PLC 确认信号 (bNext)，准备传输下一批...")
                    plc_ready = await self._wait_for_plc_next_signal(batch_idx)
                    
                    if not plc_ready:
                        self.logger.error(f"等待 PLC 确认信号超时，传输中断")
                        return False
                    
                    self.logger.info(f"PLC 确认信号已收到，继续传输下一批")
            
            self.logger.info(f"所有 {max_batches} 批数据传输完成")
            return True
            
        except Exception as e:
            self.logger.error(f"分批传输失败：{e}", exc_info=True)
            return False
    
    async def _write_batch_to_buffers(self,
                                     batch_data: List[List[Any]],
                                     batch_time: List[List[datetime]],
                                     current_batch: int,
                                     total_batches: int,
                                     total_counts: List[int],
                                     sent_counts: List[int]) -> bool:
        """
        写入单批数据到缓冲区
        
        Args:
            batch_data: 当前批次的数据
            batch_time: 当前批次的时间
            current_batch: 当前批次索引（从 0 开始）
            total_batches: 总批次数
            total_counts: 每个缓冲区的总数据量
            sent_counts: 每个缓冲区已发送的数据量
            
        Returns:
            bool: 写入是否成功
        """
        try:
            if not self.opcua_client.is_connected():
                self.logger.error("OPC UA 客户端未连接，无法写入数据")
                return False
            
            # 写入数据缓冲区
            success_count = 0
            for i, buffer_node in enumerate(self.buffer_nodes):
                if i < len(batch_data) and len(batch_data[i]) > 0:
                    data_to_write = batch_data[i].copy()
                    actual_count = len(data_to_write)
                    
                    # 如果数据不足 buffer_size，用 0.0 填充
                    if len(data_to_write) < self.buffer_size:
                        data_to_write.extend([0.0] * (self.buffer_size - len(data_to_write)))
                    
                    # 写入数据
                    success = await self._write_to_node(buffer_node, data_to_write, ua.VariantType.Float)
                    if success:
                        success_count += 1
                        self.logger.debug(f"批次 {current_batch + 1}/{total_batches} - "
                                        f"成功写入缓冲区 {i+1}: {buffer_node}, "
                                        f"本批实际数据量={actual_count}")
                    else:
                        self.logger.warning(f"批次 {current_batch + 1}/{total_batches} - "
                                          f"写入缓冲区 {i+1} 失败：{buffer_node}")
                else:
                    # 写入空缓冲区
                    empty_data = [0.0] * self.buffer_size
                    success = await self._write_to_node(buffer_node, empty_data, ua.VariantType.Float)
                    if success:
                        success_count += 1
                        self.logger.debug(f"批次 {current_batch + 1}/{total_batches} - "
                                        f"写入空缓冲区 {i+1}")
            
            # 写入时间缓冲区
            for i, time_node in enumerate(self.time_nodes):
                if i < len(batch_time) and len(batch_time[i]) > 0:
                    time_to_write = [fast_dt_to_date_and_time(t) for t in batch_time[i]]
                    actual_count = len(time_to_write)
                    
                    # 如果数据不足 buffer_size，用 0 填充
                    if len(time_to_write) < self.buffer_size:
                        time_to_write.extend([0] * (self.buffer_size - len(time_to_write)))
                    
                    # 写入时间
                    success = await self._write_to_node(time_node, time_to_write, ua.VariantType.UInt32)
                    if success:
                        self.logger.debug(f"批次 {current_batch + 1}/{total_batches} - "
                                        f"成功写入时间缓冲区 {i+1}: {time_node}, "
                                        f"本批实际数据量={actual_count}")
                    else:
                        self.logger.warning(f"批次 {current_batch + 1}/{total_batches} - "
                                          f"写入时间缓冲区 {i+1} 失败：{time_node}")
            
            # 写入反馈信息（剩余待发送数据量）
            for i, feed_back_node in enumerate(self.feed_back_nodes):
                if i < len(total_counts):
                    # 剩余量 = 总量 - 已发送量
                    remaining_count = total_counts[i] - sent_counts[i]
                    current_batch_send_count = sent_counts[i] - (current_batch) * self.buffer_size
                    if current_batch_send_count < 0:
                        current_batch_send_count = 0
                    fead_back_count = current_batch_send_count + remaining_count

                    # 反馈信息包含：剩余待发送数据量
                    success = await self._write_to_node(
                        feed_back_node,
                        [fead_back_count],
                        ua.VariantType.UInt32,
                        log_success=False
                    )
                    if success:
                        self.logger.debug(
                            f"批次 {current_batch + 1}/{total_batches} - "
                            f"反馈 {i+1} 已更新: 总量={total_counts[i]}, 已发送={sent_counts[i]}, 剩余={remaining_count}"
                        )
                    else:
                        self.logger.warning(f"批次 {current_batch + 1}/{total_batches} - "
                                          f"写入反馈 {i+1} 失败：{feed_back_node}")
            
            self.logger.info(f"批次 {current_batch + 1}/{total_batches} - 写入完成，剩余待发送：{sum(total_counts) - sum(sent_counts)}")
            return success_count > 0
            
        except Exception as e:
            self.logger.error(f"写入单批数据失败：{e}", exc_info=True)
            return False
    
    async def _wait_for_plc_next_signal(self, current_batch: int, timeout: float = 30.0) -> bool:
        """
        等待 PLC 的 bNext 上升沿信号
        
        Args:
            current_batch: 当前批次索引
            timeout: 超时时间（秒）
            
        Returns:
            bool: 是否收到信号
        """
        try:
            import asyncio
            
            start_time = asyncio.get_event_loop().time()
            
            # 读取 bNext 信号初始状态
            try:
                node = self.opcua_client.client.get_node(self.cmd_next_nodes[0])
                initial_value = node.get_value()
                previous_state = bool(initial_value) if initial_value is not None else False
                
                self.logger.debug(f"bNext 初始状态：{initial_value} ({previous_state})")
                
            except Exception as e:
                self.logger.warning(f"读取 bNext 初始状态失败：{e}")
                previous_state = False
            
            # 循环检测上升沿
            while True:
                # 检查超时
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > timeout:
                    self.logger.error(f"等待 PLC 信号超时 ({timeout}秒)")
                    return False
                
                try:
                    # 读取 bNext 当前状态
                    node = self.opcua_client.client.get_node(self.cmd_next_nodes[0])
                    current_value = node.get_value()
                    current_state = bool(current_value) if current_value is not None else False
                    
                    # 检测上升沿：从 False 变为 True
                    if not previous_state and current_state:
                        self.logger.info(f"检测到 bNext 上升沿信号 (批次 {current_batch + 1})")
                        return True
                    
                    # 更新状态
                    previous_state = current_state
                    
                except Exception as e:
                    self.logger.debug(f"读取 bNext 失败：{e}")
                
                # 等待 100ms 后再次检测
                await asyncio.sleep(0.1)
                
        except Exception as e:
            self.logger.error(f"等待 PLC 信号过程出错：{e}", exc_info=True)
            return False
    
    async def _write_feed_back_status(self, status: int) -> bool:
        """
        写入查询反馈状态到 OPC UA 服务器
        
        Args:
            status: 状态码或总批次数
            
        Returns:
            bool: 写入是否成功
        """
        if not self.feed_back_point:
            self.logger.debug("未配置反馈点，跳过状态写入")
            return True
        
        try:
            if not self.opcua_client.is_connected():
                self.logger.error("OPC UA 客户端未连接，无法写入反馈状态")
                return False
            
            # 写入 UInt16 类型的状态值
            success = await self._write_to_node(
                self.feed_back_point, 
                [status], 
                ua.VariantType.UInt16
            )
            
            if success:
                status_text = {
                    self.QUERY_STATUS_IDLE: "空闲",
                    self.QUERY_STATUS_RUNNING: "正在查询",
                    self.QUERY_STATUS_SUCCESS: "查询成功",
                    self.QUERY_STATUS_NO_DATA: "无数据",
                    self.QUERY_STATUS_ERROR: "错误"
                }.get(status, f"未知状态 ({status})")
                
                self.logger.info(f"已写入查询反馈状态：{status} ({status_text})")
            else:
                self.logger.warning(f"写入反馈状态失败：{status}")
            
            return success
            
        except Exception as e:
            self.logger.error(f"写入反馈状态失败：{e}", exc_info=True)
            return False
        
    async def _send_to_http_server(self,
                                  query_results: List[List[Any]],
                                  query_time: List[List[Any]],
                                  point_names: List[str]) -> bool:
        """
        发送查询结果到 HTTP 服务器
            
        Args:
            query_results: 查询结果列表
            query_time: 查询时间列表
            point_names: 数据点名称列表
                
        Returns:
            bool: 发送是否成功
        """
        try:
            # 构建要发送的数据结构
            http_data = {
                'timestamp': datetime.now().isoformat(),
                'group_name': self.query_group_config.name if self.query_group_config else 'unknown',
                'point_names': point_names,
                'data_count': len(query_results),
                'buffers': []
            }
                
            # 添加每个缓冲区的数据
            for i, (buffer_data, buffer_time) in enumerate(zip(query_results, query_time)):
                buffer_info = {
                    'buffer_index': i,
                    'values': buffer_data[:100],  # 只发送前 100 个值，避免数据量过大
                    'times': [t.isoformat() if hasattr(t, 'isoformat') else str(t) 
                             for t in buffer_time[:100]],
                    'total_count': len(buffer_data)
                }
                http_data['buffers'].append(buffer_info)
                
            # 发送数据
            success = await self.http_client.send_data(http_data)
                
            if success:
                self.logger.info(f"成功发送数据到 HTTP 服务器，共 {len(query_results)} 个缓冲区")
            else:
                self.logger.warning("发送数据到 HTTP 服务器失败")
                
            return success
                
        except Exception as e:
            self.logger.error(f"发送数据到 HTTP 服务器失败：{e}", exc_info=True)
            return False
    
    def _convert_to_float_arrays(self, 
                                query_results: List[Dict[str, Any]],
                                point_names: List[str]) -> List[List[float]]:
        """
        将查询结果转换为浮点数数组
        
        Args:
            query_results: 查询结果列表
            point_names: 数据点名称列表
            
        Returns:
            List[List[float]]: 浮点数数组列表，每个子列表对应一个缓冲区
        """
        # 提取所有数据点的值并转换为浮点数
        all_values = []
        
        for row in query_results:
            for point_name in point_names:
                value = row.get(point_name)
                
                # 将值转换为浮点数（即使是整数也转换）
                try:
                    if value is not None:
                        float_value = float(value)
                        all_values.append(float_value)
                    else:
                        # 如果值为 None，使用 0.0 替代
                        all_values.append(0.0)
                except (TypeError, ValueError) as e:
                    self.logger.warning(f"无法将值 {value} 转换为浮点数：{e}，使用 0.0 替代")
                    all_values.append(0.0)
        
        # 将数据分配到 3 个缓冲区
        buffer_arrays = [[], [], []]
        for i, value in enumerate(all_values):
            buffer_index = i % 3
            buffer_arrays[buffer_index].append(value)
        
        return buffer_arrays
    
    async def _write_to_node(self, node_path: str, values: List[Any], ua_type: Any, log_success: bool = True) -> bool:
        """
        写入浮点数数组到指定节点
        
        Args:
            node_path: 节点路径
            values: 数组
            ua_type: 节点类型
            
        Returns:
            bool: 写入是否成功
        """
        try:
            if not self.opcua_client.client:
                self.logger.error("OPC UA 客户端不可用")
                return False
            
            # 获取节点
            node = self.opcua_client.client.get_node(node_path)
            
            # 创建 Float 数组变体
            variant = ua.Variant(values, ua_type)
            
            # 写入数据
            node.set_attribute(ua.AttributeIds.Value, ua.DataValue(variant))
            
            if log_success:
                self.logger.debug(f"成功写入 {len(values)} 个数到 {node_path}")
            return True
            
        except Exception as e:
            error_text = str(e)
            if "BadTypeMismatch" in error_text:
                self.logger.error(
                    f"节点类型不匹配: {node_path}。请检查该节点在 PLC/OPC UA 中的数据类型，"
                    f"以及 query_config 映射与写入类型是否一致（当前写入类型: {ua_type}）。"
                )
            self.logger.error(f"写入节点 {node_path} 失败：{e}", exc_info=True)
            return False
