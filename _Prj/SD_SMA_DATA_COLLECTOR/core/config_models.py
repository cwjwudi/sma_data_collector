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
    TIME_AND_VARIABLE = "time_and_variable"
    QUERY = "query"


class OutputMode(Enum):
    """输出模式枚举"""
    DUAL = "dual"  # 双通道输出（同时输出到 OPC UA 和 HTTP）
    OPC_UA_ONLY = "opcua_only"  # 只输出到 OPC UA
    HTTP_ONLY = "http_only"  # 只输出到 HTTP


@dataclass
class DataPoint:
    """数据点配置"""
    name: str
    path: str
    description: str
    datatype: Optional[str] = None  # 可选的数据类型，如 "datetime", "int", "float", "string" 等


@dataclass
class DataGroup:
    """数据组配置"""
    name: str
    interval_seconds: int
    trigger: TriggerType
    description: str
    data_points: List[str]
    trigger_interval_seconds: Optional[float] = None  # time_and_variable：触发变量采样周期（秒）
    trigger_point: Optional[str] = None
    reset_trigger_after_read: bool = True  # 是否在读取后复位触发点
    recreate_interval_days: int = 30  # 数据库分表间隔天数
    batch_insert_size: int = 100  # 批量插入大小
    query_config: Optional[Dict[str, Any]] = None  # 查询配置（仅 query 类型使用）
    output_mode: str = "dual"  # 输出模式："dual", "opcua_only", "http_only"
    is_parallel: bool = False  # 是否启用并行触发模式（trigger_point 和 data_points 为数组节点）
    
    def get_buffer_nodes(self) -> List[str]:
        """获取缓冲区节点列表（从 query_config 中）"""
        if self.query_config and 'buffer_nodes' in self.query_config:
            return self.query_config['buffer_nodes']
        # 返回默认值（向后兼容）
        return [
            f'ns=6;s=::DataRev:stDbReadQuery.stRev[{i}].rRevBuffer'
            for i in range(10)
        ]
    
    def get_time_nodes(self) -> List[str]:
        """获取时间节点列表（从 query_config 中）"""
        if self.query_config and 'time_nodes' in self.query_config:
            return self.query_config['time_nodes']
        # 返回默认值（向后兼容）
        return [
            f'ns=6;s=::DataRev:stDbReadQuery.stRev[{i}].udiRevTime'
            for i in range(10)
        ]
    
    def get_buffer_size(self) -> int:
        """获取缓冲区大小（从 query_config 中）"""
        if self.query_config and 'buffer_size' in self.query_config:
            return self.query_config['buffer_size']
        # 返回默认值（向后兼容）
        return 10000
    
    def get_feed_back_nodes(self) -> List[str]:
        """获取反馈节点列表（从 query_config 中）"""
        if self.query_config and 'feed_back_nodes' in self.query_config:
            return self.query_config['feed_back_nodes']
        # 返回默认值（向后兼容）
        return [
            f'ns=6;s=::DataRev:stDbReadQuery.stRev[{i}].udiRevFeedBack'
            for i in range(10)
        ]
    
    def get_cmd_next_nodes(self) -> List[str]:
        """获取下一批命令节点列表（从 query_config 中）"""
        if self.query_config and 'cmd_next_nodes' in self.query_config:
            return self.query_config['cmd_next_nodes']
        # 返回默认值（向后兼容）
        return [
            f'ns=6;s=::DataRev:stDbReadQuery.stCmd.bNext[{i}]'
            for i in range(10)
        ]
    
    def get_feed_back_point(self) -> Optional[str]:
        """获取反馈信号节点路径（从 query_config 中）"""
        if self.query_config and 'feed_back_point' in self.query_config:
            return self.query_config['feed_back_point']
        return None
    
    def get_output_mode(self) -> OutputMode:
        """获取输出模式"""
        try:
            return OutputMode(self.output_mode)
        except ValueError:
            # 如果配置无效，默认返回双通道输出
            return OutputMode.DUAL
    
    def should_output_to_opcua(self) -> bool:
        """判断是否应该输出到 OPC UA"""
        mode = self.get_output_mode()
        return mode in [OutputMode.DUAL, OutputMode.OPC_UA_ONLY]
    
    def should_output_to_http(self) -> bool:
        """判断是否应该输出到 HTTP 服务器"""
        mode = self.get_output_mode()
        return mode in [OutputMode.DUAL, OutputMode.HTTP_ONLY]


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
    heartbeat: Optional[str] = None  # 心跳信号的 OPC UA 地址（可选）


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
class HttpServerConfig:
    """HTTP 服务器配置"""
    enabled: bool = False  # 是否启用 HTTP 发送功能
    base_url: str = "http://localhost:8080"  # HTTP 服务器地址
    endpoint: str = "/api/data"  # API 端点
    timeout: int = 30  # 请求超时时间（秒）
    max_retries: int = 3  # 最大重试次数
    retry_delay: float = 1.0  # 重试延迟（秒）


@dataclass
class LoggingConfig:
    """日志配置"""
    level: str = "INFO"  # 日志级别（DEBUG/INFO/WARNING/ERROR/CRITICAL）
    output_dir: Optional[str] = None  # 日志输出目录，未配置时使用默认目录
    backup_days: int = 14  # 日志保留天数
    rotation_when: str = "midnight"  # 轮转周期: S/M/H/D/midnight/W0-W6
    rotation_interval: int = 1  # 轮转周期倍数
    console_enabled: bool = True  # 是否输出到控制台


@dataclass
class AppConfig:
    """应用总配置"""
    points: List[DataPoint]
    groups: List[DataGroup]
    opcua: OpcUaConfig  # 为了向后兼容保留
    database: DatabaseConfig
    communications: List[Communication] = None  # 新增：通信配置列表
    connections: List[Connection] = None  # 新增：连接配置列表
    http_server: HttpServerConfig = None  # HTTP 服务器配置
    logging: LoggingConfig = None  # 日志配置
    
    def __post_init__(self):
        # 保持向后兼容性
        if self.communications is None:
            self.communications = []
        if self.connections is None:
            self.connections = []
        if self.http_server is None:
            self.http_server = HttpServerConfig()
        if self.logging is None:
            self.logging = LoggingConfig()
        
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