"""
配置模块数据模型
定义数据点、数据组和数据库配置的数据结构
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum


class TriggerType(Enum):
    """触发类型枚举"""
    TIME = "time"
    VARIABLE = "variable"
    QUERY = "query"


@dataclass
class DataPoint:
    """数据点配置"""
    name: str
    path: str
    description: str


@dataclass
class DataGroup:
    """数据组配置"""
    name: str
    interval_seconds: int
    trigger: TriggerType
    description: str
    data_points: List[str]
    trigger_point: Optional[str] = None
    reset_trigger_after_read: bool = True  # 是否在读取后复位触发点
    recreate_interval_days: int = 30  # 数据库分表间隔天数
    batch_insert_size: int = 100  # 批量插入大小
    query_config: Optional[Dict[str, Any]] = None  # 查询配置（仅 query 类型使用）


@dataclass
class Communication:
    """通信配置"""
    name: str
    type: str  # 目前只支持 "opcua"
    host: str = "127.0.0.1"
    port: int = 4840
    
    @property
    def server_url(self) -> str:
        """获取完整的服务器URL"""
        return f"opc.tcp://{self.host}:{self.port}"


@dataclass
class Connection:
    """连接配置 - 定义哪些数据组使用哪个通信"""
    name: str
    communication: str  # 通信名称
    data_groups: List[str]  # 使用此通信的数据组列表


@dataclass
class OpcUaConfig:
    """OPC UA服务器配置 (为了向后兼容保留)"""
    host: str = "127.0.0.1"
    port: int = 4840
    
    @property
    def server_url(self) -> str:
        """获取完整的OPC UA服务器URL"""
        return f"opc.tcp://{self.host}:{self.port}"


@dataclass
class DatabaseConfig:
    """数据库配置"""
    type: str  # "mysql" 或 "sqlite"
    name: str
    host: str = "127.0.0.1"
    port: int = 3306
    username: str = ""
    password: str = ""
    data_groups: List[str] = None  # 支持多个数据组
    
    def __post_init__(self):
        # 保持向后兼容性
        if self.data_groups is None:
            self.data_groups = []


@dataclass
class AppConfig:
    """应用总配置"""
    points: List[DataPoint]
    groups: List[DataGroup]
    opcua: OpcUaConfig  # 为了向后兼容保留
    database: DatabaseConfig
    communications: List[Communication] = None  # 新增：通信配置列表
    connections: List[Connection] = None  # 新增：连接配置列表
    
    def __post_init__(self):
        # 保持向后兼容性
        if self.communications is None:
            self.communications = []
        if self.connections is None:
            self.connections = []
        
        # 如果没有communications配置，从opcua配置创建默认通信
        if not self.communications and self.opcua:
            default_comm = Communication(
                name="default",
                type="opcua",
                host=self.opcua.host,
                port=self.opcua.port
            )
            self.communications = [default_comm]
            
            # 如果没有connections配置，创建默认连接
            if not self.connections:
                # 默认将所有数据组关联到default通信
                group_names = [group.name for group in self.groups]
                default_conn = Connection(
                    name="default_connection",
                    communication="default",
                    data_groups=group_names
                )
                self.connections = [default_conn]
        
        # 创建通信到数据组的映射，便于快速查找
        self._comm_to_groups_map: Dict[str, List[str]] = {}
        for conn in self.connections:
            self._comm_to_groups_map[conn.communication] = conn.data_groups
    
    def get_groups_for_communication(self, comm_name: str) -> List[str]:
        """获取指定通信对应的数据组列表"""
        return self._comm_to_groups_map.get(comm_name, [])
    
    def get_communication_for_group(self, group_name: str) -> Optional[str]:
        """获取指定数据组对应的通信名称"""
        for conn in self.connections:
            if group_name in conn.data_groups:
                return conn.communication
        return None