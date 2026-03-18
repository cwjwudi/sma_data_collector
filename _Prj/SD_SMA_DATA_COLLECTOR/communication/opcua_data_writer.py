"""
OPC UA 数据写入器
负责将查询结果写入 OPC UA 服务器的缓冲区
"""

import logging
from typing import List, Dict, Any
from opcua import ua
# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from communication.opcua_client import OpcUaClient
from communication.date_and_time import fast_dt_to_date_and_time


class OpcUaDataWriter:
    """OPC UA 数据写入器类"""
    
    def __init__(self, opcua_client: OpcUaClient):
        """
        初始化 OPC UA 数据写入器
        
        Args:
            opcua_client: OPC UA 客户端实例
        """
        self.opcua_client = opcua_client
        self.logger = logging.getLogger(__name__)
        
        # 缓冲区节点配置
        self.buffer_nodes = [
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[0].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[1].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[2].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[3].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[4].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[5].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[6].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[7].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[8].rRevBuffer',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[9].rRevBuffer',
        ]

        self.time_nodes = [
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[0].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[1].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[2].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[3].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[4].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[5].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[6].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[7].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[8].udiRevTime',
            'ns=6;s=::AlarmQuerr:stDbReadQuery.stRev[9].udiRevTime',
        ]

        self.buffer_size = 10000  # 每个缓冲区的长度
    
    async def write_query_results(self, 
                                  query_results: List[List[Any]],
                                  query_time: List[List[Any]],
                                  point_names: List[str]) -> bool:
        """
        将查询结果写入 OPC UA 缓冲区
        
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
            
            # 检查连接状态
            if not self.opcua_client.is_connected():
                self.logger.error("OPC UA 客户端未连接，无法写入数据")
                return False
            
            # 将数据转换为浮点数数组
            # float_data = self._convert_to_float_arrays(query_results, point_names)
            
            # 数据依次写入各个缓冲区
            success_count = 0
            for i, buffer_node in enumerate(self.buffer_nodes):
                if i < len(query_results):
                    # 截断超出部分
                    data_to_write = query_results[i][:self.buffer_size]
                    
                    # 如果数据不足 1000 个，用 0.0 填充
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

                    # 修改时间格式为UINT32
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
            
            return success_count > 0
            
        except Exception as e:
            self.logger.error(f"写入 OPC UA 缓冲区失败：{e}", exc_info=True)
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
