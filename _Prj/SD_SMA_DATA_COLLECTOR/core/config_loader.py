"""
配置加载器
负责从JSON文件加载和验证配置
"""

import json
from typing import Dict, Any
from .config_models import (
    DataPoint, DataGroup, OpcUaConfig, DatabaseConfig, AppConfig, 
    TriggerType, Communication, Connection, HttpServerConfig
)


class ConfigLoader:
    """配置加载器类"""
    
    @staticmethod
    def load_from_file(file_path: str) -> AppConfig:
        """
        从JSON文件加载配置
        
        Args:
            file_path: 配置文件路径
            
        Returns:
            AppConfig: 应用配置对象
            
        Raises:
            FileNotFoundError: 配置文件不存在
            ValueError: 配置格式错误
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            return ConfigLoader._parse_config(config_data)
        except FileNotFoundError:
            raise FileNotFoundError(f"配置文件未找到: {file_path}")
        except json.JSONDecodeError as e:
            raise ValueError(f"配置文件格式错误: {e}")
    
    @staticmethod
    def _parse_config(config_data: Dict[str, Any]) -> AppConfig:
        """解析配置数据"""
        # 解析数据点
        points = []
        for point_data in config_data.get('points', []):
            point = DataPoint(
                name=point_data['name'],
                path=point_data['path'],
                description=point_data['description'],
                datatype=point_data.get('datatype')  # 可选的 datatype 属性
            )
            points.append(point)
        
        # 解析数据组
        groups = []
        for group_data in config_data.get('groups', []):
            group = DataGroup(
                name=group_data['name'],
                interval_seconds=group_data['interval_seconds'],
                trigger=TriggerType(group_data['trigger']),
                description=group_data['description'],
                data_points=group_data['data_points'],
                trigger_interval_seconds=group_data.get('trigger_interval_seconds'),
                trigger_point=group_data.get('trigger_point'),
                reset_trigger_after_read=group_data.get('reset_trigger_after_read', True),
                recreate_interval_days=group_data.get('recreate_interval_days', 30),
                batch_insert_size=group_data.get('batch_insert_size', 100),
                query_config=group_data.get('query_config'),
                is_parallel=group_data.get('is_parallel', False)
            )
            groups.append(group)
        
        # 解析通信配置
        communications = []
        communications_data = config_data.get('communications', [])
        for comm_data in communications_data:
            comm = Communication(
                name=comm_data['name'],
                type=comm_data['type'],
                host=comm_data.get('host', '127.0.0.1'),
                port=comm_data.get('port', 4840)
            )
            communications.append(comm)
        
        # 解析连接配置
        connections = []
        connections_data = config_data.get('connections', [])
        for conn_data in connections_data:
            conn = Connection(
                name=conn_data['name'],
                communication=conn_data['communication'],
                data_groups=conn_data['data_groups'],
                heartbeat=conn_data.get('heartbeat', None) 
            )
            connections.append(conn)
        
        # 解析OPC UA配置 (为了向后兼容保留)
        opcua_data = config_data.get('opcua', {})
        opcua = OpcUaConfig(
            host=opcua_data.get('host', '127.0.0.1'),
            port=opcua_data.get('port', 4840)
        )
        
        # 解析数据库配置
        db_data = config_data.get('database', {})
                
        # 处理向后兼容性：如果存在旧的 data_group 字段，则转换为 data_groups
        data_groups = db_data.get('data_groups', [])
        if not data_groups and 'data_group' in db_data:
            data_groups = [db_data['data_group']] if db_data['data_group'] else []
                
        database = DatabaseConfig(
            type=db_data.get('type', 'sqlite'),
            name=db_data.get('name', 'data.db'),
            host=db_data.get('host', '127.0.0.1'),
            port=db_data.get('port', 3306),
            username=db_data.get('username', ''),
            password=db_data.get('password', ''),
            data_groups=data_groups
        )
                
        # 解析 HTTP 服务器配置
        http_server_data = config_data.get('http_server', {})
        http_server = HttpServerConfig(
            enabled=http_server_data.get('enabled', False),
            base_url=http_server_data.get('base_url', 'http://localhost:8080'),
            endpoint=http_server_data.get('endpoint', '/api/data'),
            timeout=http_server_data.get('timeout', 30),
            max_retries=http_server_data.get('max_retries', 3),
            retry_delay=http_server_data.get('retry_delay', 1.0)
        )
                
        # 创建应用配置
        config = AppConfig(
            points=points,
            groups=groups,
            opcua=opcua,
            database=database,
            communications=communications,
            connections=connections,
            http_server=http_server
        )
        
        # 验证配置
        ConfigLoader._validate_config(config)
        
        return config
    
    @staticmethod
    def _validate_config(config: AppConfig) -> None:
        """验证配置的有效性"""
        # 检查数据点名称唯一性
        point_names = [point.name for point in config.points]
        if len(point_names) != len(set(point_names)):
            raise ValueError("数据点名称必须唯一")
        
        # 检查数据组引用的数据点是否存在
        point_name_set = set(point_names)
        for group in config.groups:
            for point_name in group.data_points:
                if point_name not in point_name_set:
                    raise ValueError(f"数据组 '{group.name}' 引用了不存在的数据点: {point_name}")
            
            if group.trigger == TriggerType.VARIABLE:
                if not group.trigger_point:
                    raise ValueError(f"触发类型为variable的数据组 '{group.name}' 必须指定trigger_point")
                if group.trigger_point not in point_name_set:
                    raise ValueError(f"数据组 '{group.name}' 的触发点不存在: {group.trigger_point}")

            if group.trigger == TriggerType.TIME_AND_VARIABLE:
                if group.is_parallel:
                    raise ValueError(
                        f"数据组 '{group.name}' 的触发类型 time_and_variable 不支持并行模式，请将 is_parallel 设为 false"
                    )
                if not group.trigger_point:
                    raise ValueError(
                        f"触发类型为time_and_variable的数据组 '{group.name}' 必须指定 trigger_point"
                    )
                if group.trigger_point not in point_name_set:
                    raise ValueError(f"数据组 '{group.name}' 的触发点不存在: {group.trigger_point}")
                if group.trigger_interval_seconds is None:
                    raise ValueError(
                        f"数据组 '{group.name}' 使用 time_and_variable 时必须配置 trigger_interval_seconds（秒）"
                    )
                try:
                    tri = float(group.trigger_interval_seconds)
                except (TypeError, ValueError):
                    raise ValueError(
                        f"数据组 '{group.name}' 的 trigger_interval_seconds 必须为数值"
                    ) from None
                if tri <= 0:
                    raise ValueError(
                        f"数据组 '{group.name}' 的 trigger_interval_seconds 必须大于 0"
                    )
        
        # 检查数据库配置引用的数据组是否存在
        group_names = [group.name for group in config.groups]
        for data_group_name in config.database.data_groups:
            if data_group_name not in group_names:
                raise ValueError(f"数据库配置引用了不存在的数据组: {data_group_name}")
        
        # 检查通信配置
        if config.communications:
            comm_names = [comm.name for comm in config.communications]
            # 检查通信名称唯一性
            if len(comm_names) != len(set(comm_names)):
                raise ValueError("通信名称必须唯一")
            
            # 检查目前只支持opcua类型
            for comm in config.communications:
                if comm.type != "opcua":
                    raise ValueError(f"目前只支持opcua类型的通信，不支持: {comm.type}")
            
            # 检查连接配置
            if config.connections:
                conn_names = [conn.name for conn in config.connections]
                # 检查连接名称唯一性
                if len(conn_names) != len(set(conn_names)):
                    raise ValueError("连接名称必须唯一")
                
                # 检查连接引用的通信是否存在
                for conn in config.connections:
                    if conn.communication not in comm_names:
                        raise ValueError(f"连接 '{conn.name}' 引用了不存在的通信: {conn.communication}")
                    
                    # 检查连接引用的数据组是否存在
                    for group_name in conn.data_groups:
                        if group_name not in group_names:
                            raise ValueError(f"连接 '{conn.name}' 引用了不存在的数据组: {group_name}")
                
                # 检查每个数据组只能被一个连接引用
                referenced_groups = set()
                for conn in config.connections:
                    for group_name in conn.data_groups:
                        if group_name in referenced_groups:
                            raise ValueError(f"数据组 '{group_name}' 被多个连接引用")
                        referenced_groups.add(group_name)
                
                # 检查所有数据组都被引用
                all_referenced = referenced_groups == set(group_names)
                if not all_referenced:
                    missing_groups = set(group_names) - referenced_groups
                    raise ValueError(f"以下数据组未被任何连接引用: {missing_groups}")