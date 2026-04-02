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

            self.buffer_size = 10000  # 每个缓冲区的长度
            self.feed_back_point = None  # 默认无反馈点
    
    async def write_query_results(self, 
                                  query_results: List[List[Any]],
                                  query_time: List[List[Any]],
                                  point_names: List[str]) -> bool:
        """
        将查询结果写入 OPC UA 缓冲区并发送到 HTTP 服务器（根据 output_mode 配置）
            
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
                
            # 根据 output_mode 配置决定输出到哪些通道
            output_to_opcua = True
            output_to_http = True
            
            if self.query_group_config:
                output_to_opcua = self.query_group_config.should_output_to_opcua()
                output_to_http = self.query_group_config.should_output_to_http()
                
                self.logger.info(f"查询组 '{self.query_group_config.name}' 输出模式："
                               f"OPC UA={output_to_opcua}, HTTP={output_to_http}")
            
            # 1️⃣ 写入 OPC UA 缓冲区（如果配置了输出到 OPC UA）
            opcua_success = True
            if output_to_opcua:
                opcua_success = await self._write_to_opcua_buffers(query_results, query_time, point_names)
            else:
                self.logger.debug("输出模式配置为不输出到 OPC UA，跳过写入")
                
            # 2️⃣ 发送到 HTTP 服务器（如果配置了输出到 HTTP 且有 HTTP 客户端）
            http_success = True
            if output_to_http and self.http_client:
                self.logger.info("准备发送数据到 HTTP 服务器...")
                http_success = await self._send_to_http_server(query_results, query_time, point_names)
            elif not output_to_http:
                self.logger.debug("输出模式配置为不输出到 HTTP，跳过发送")
            else:
                self.logger.debug("未配置 HTTP 客户端，跳过 HTTP 发送")
                
            # 返回整体成功状态（只要 OPC UA 成功即可）
            return opcua_success
                
        except Exception as e:
            self.logger.error(f"写入查询结果失败：{e}", exc_info=True)
            return False
    
    async def _write_feed_back_status(self, status: int) -> bool:
        """
        写入查询反馈状态到 OPC UA 服务器
        
        Args:
            status: 状态码 (0-空闲，1-正在查询，2-成功，3-无数据，4-错误)
            
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
                
            # 数据依次写入各个缓冲区
            success_count = 0
            for i, buffer_node in enumerate(self.buffer_nodes):
                if i < len(query_results):
                    # 截断超出部分
                    data_to_write = query_results[i][:self.buffer_size]
                    # 如果数据为空，跳过写入
                    if len(data_to_write) == 0:
                        self.logger.warning(f"缓冲区 {i+1} 数据为空，跳过写入")
                        continue
                    # 如果数据不足 10000 个，用 0.0 填充
                    if len(data_to_write) < self.buffer_size:
                        data_to_write.extend([0.0] * (self.buffer_size - len(data_to_write)))
                        
                    # 写入数据
                    success = await self._write_to_node(buffer_node, data_to_write, ua.VariantType.Float)
                    if success:
                        success_count += 1
                        self.logger.info(f"成功写入缓冲区 {i+1}: {buffer_node}, "
                                       f"数据长度={len(query_results[i])}, "
                                       f"写入长度={len(data_to_write)}")
                    else:
                        self.logger.warning(f"写入缓冲区 {i+1} 失败：{buffer_node}")
                else:
                    self.logger.warning(f"没有足够的数据写入缓冲区 {i+1}")
                
            self.logger.info(f"写入完成，成功 {success_count}/{len(self.buffer_nodes)} 个缓冲区")
    
            for i, time_node in enumerate(self.time_nodes):
                if i < len(query_time):
                    # 截断超出部分
                    time_to_write = query_time[i][:self.buffer_size]
                    # 如果数据为空，跳过写入
                    if len(time_to_write) == 0:
                        self.logger.warning(f"缓冲区 {i+1} 时间数据为空，跳过写入")
                        continue    
                    # 修改时间格式为 UINT32
                    time_to_write = [fast_dt_to_date_and_time(t) for t in time_to_write]
                        
                    # 如果数据不足 1000 个，用 0 填充
                    if len(time_to_write) < self.buffer_size:
                        time_to_write.extend([0] * (self.buffer_size - len(time_to_write)))
    
                    # 写入数据
                    success = await self._write_to_node(time_node, time_to_write, ua.VariantType.UInt32)
                    if success:
                        self.logger.info(f"成功写入时间缓冲区 {i+1}: {time_node}, "
                                       f"数据长度={len(query_time[i])}, "
                                       f"写入长度={len(time_to_write)}")
                    else:
                        self.logger.warning(f"写入时间缓冲区 {i+1} 失败：{time_node}")
                else:
                    self.logger.warning(f"没有足够的数据写入时间缓冲区 {i+1}")
            self.logger.info(f"写入完成，成功 {success_count}/{len(self.time_nodes)} 个时间缓冲区")
    
            # 写入反馈数据（实际写入的数据数量）
            for i, feed_back_node in enumerate(self.feed_back_nodes):
                if i < len(query_results):
                    # 获取实际数据量
                    actual_data_count = len(query_results[i])
                    
                    # 写入实际数据量作为反馈
                    success = await self._write_to_node(feed_back_node, [actual_data_count], ua.VariantType.UInt32)
                    if success:
                        self.logger.info(f"成功写入反馈 {i+1}: {feed_back_node}, "
                                       f"实际数据量={actual_data_count}")
                    else:
                        self.logger.warning(f"写入反馈 {i+1} 失败：{feed_back_node}")
                else:
                    # 如果没有对应的数据，写入 0
                    success = await self._write_to_node(feed_back_node, [0], ua.VariantType.UInt32)
                    if success:
                        self.logger.info(f"成功写入反馈 {i+1}: {feed_back_node}, 无数据 (0)")
                    else:
                        self.logger.warning(f"写入反馈 {i+1} 失败：{feed_back_node}")
            
            self.logger.info(f"写入完成，成功 {len(self.feed_back_nodes)}/{len(self.feed_back_nodes)} 个反馈节点")
                
            return success_count > 0
                
        except Exception as e:
            self.logger.error(f"写入 OPC UA 缓冲区失败：{e}", exc_info=True)
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
    
    async def _write_to_node(self, node_path: str, values: List[Any], ua_type: Any) -> bool:
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
            
            self.logger.debug(f"成功写入 {len(values)} 个数到 {node_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"写入节点 {node_path} 失败：{e}")
            return False
