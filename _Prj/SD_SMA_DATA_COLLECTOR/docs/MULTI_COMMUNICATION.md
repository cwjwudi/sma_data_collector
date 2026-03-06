# 多控制器连接控制功能说明

## 功能概述

本系统新增了多控制器连接控制功能，允许同时连接多个OPC UA服务器，并为不同的数据组指定不同的通信连接。

## 配置结构

### 新增配置项

#### 1. communications (通信配置)
定义可用的OPC UA通信连接。

```json
"communications": [
  {
    "name": "PLC1",
    "type": "opcua",
    "host": "127.0.0.1",
    "port": 4840
  },
  {
    "name": "PLC2",
    "type": "opcua",
    "host": "127.0.0.1",
    "port": 4841
  }
]
```

字段说明：
- `name`: 通信名称（唯一标识符）
- `type`: 通信类型（目前仅支持"opcua"）
- `host`: 服务器主机地址
- `port`: 服务器端口号

#### 2. connections (连接配置)
定义哪些数据组使用哪个通信连接。

```json
"connections": [
  {
    "name": "connection1",
    "communication": "PLC1",
    "data_groups": ["sensor_group_1", "trigger_group_1"]
  },
  {
    "name": "connection2",
    "communication": "PLC2",
    "data_groups": ["sensor_group_2", "trigger_group_2"]
  }
]
```

字段说明：
- `name`: 连接名称（唯一标识符）
- `communication`: 引用的通信名称
- `data_groups`: 使用此通信的数据组名称列表

## 配置规则

1. **唯一性约束**：
   - 通信名称必须唯一
   - 连接名称必须唯一

2. **引用完整性**：
   - 连接中的`communication`必须引用已定义的通信
   - 连接中的`data_groups`必须引用已定义的数据组

3. **数据组分配**：
   - 每个数据组只能被一个连接引用
   - 所有数据组都必须被某个连接引用

4. **类型限制**：
   - 目前通信类型仅支持"opcua"

## 向后兼容性

为了保持向后兼容，原有的配置格式仍然有效：

```json
{
  "opcua": {
    "host": "127.0.0.1",
    "port": 4840
  },
  "points": [...],
  "groups": [...],
  "database": {...}
}
```

当使用旧格式时，系统会自动：
1. 创建名为"default"的通信配置
2. 创建名为"default_connection"的连接配置
3. 将所有数据组关联到"default"通信

## 使用示例

### 示例1：多PLC配置
```json
{
  "communications": [
    {
      "name": "Main_PLC",
      "type": "opcua",
      "host": "192.168.1.10",
      "port": 4840
    },
    {
      "name": "Backup_PLC",
      "type": "opcua",
      "host": "192.168.1.11",
      "port": 4840
    }
  ],
  "connections": [
    {
      "name": "main_connection",
      "communication": "Main_PLC",
      "data_groups": ["production_data", "quality_data"]
    },
    {
      "name": "backup_connection",
      "communication": "Backup_PLC",
      "data_groups": ["monitoring_data"]
    }
  ],
  ...
}
```

### 示例2：本地+远程配置
```json
{
  "communications": [
    {
      "name": "Local_PLC",
      "type": "opcua",
      "host": "127.0.0.1",
      "port": 4840
    },
    {
      "name": "Remote_PLC",
      "type": "opcua",
      "host": "192.168.100.50",
      "port": 4840
    }
  ],
  "connections": [
    {
      "name": "local_conn",
      "communication": "Local_PLC",
      "data_groups": ["sensor_group_1", "control_group"]
    },
    {
      "name": "remote_conn",
      "communication": "Remote_PLC",
      "data_groups": ["remote_sensors"]
    }
  ],
  ...
}
```

## 配置验证

系统会在启动时自动验证配置的正确性，包括：
- 通信名称唯一性
- 连接名称唯一性
- 引用完整性检查
- 数据组分配检查
- 通信类型有效性

如有配置错误，系统会给出明确的错误提示。

## 测试工具

提供了专门的配置检查工具：
```bash
python check_multi_comm_config.py config/your_config.json
```

该工具会显示：
- 所有通信配置详情
- 所有连接配置详情
- 数据组与通信的映射关系
- 统计信息

## 文件说明

- `config/sample_config_multi_comm.json`: 多通信配置示例
- `tests/test_multi_communication.py`: 多通信功能测试用例
- `check_multi_comm_config.py`: 配置检查工具
