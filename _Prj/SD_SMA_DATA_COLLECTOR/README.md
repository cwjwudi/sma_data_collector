# SMA 数据采集系统

一个工业数据采集系统，支持多 OPC UA 控制器连接，具备 MySQL/SQLite 数据库存储、HTTP 数据推送和查询回写功能。

## 功能说明

### 1. 定时采集

定时采集模式按照预设的时间间隔自动从 OPC UA 服务器读取数据并存储到数据库。

**主要特性：**
- ✅ **时间间隔触发**: 按照配置的间隔自动采集数据
- ✅ **多数据点支持**: 每个数据组支持多个数据点同时采集
- ✅ **灵活配置**: 可为不同数据组设置不同的采集间隔
- ✅ **批量存储**: 支持批量数据插入，提高数据库写入效率
- ✅ **自动分表**: 按日期自动创建新表，支持自定义分表周期

**典型应用场景：**
- 传感器数据周期性采集
- 生产设备状态监控
- 能耗数据记录

### 2. 触发采集

触发采集模式由 PLC 或其他外部信号触发，当触发条件满足时执行数据采集。

**主要特性：**
- ✅ **变量触发**: 由 PLC 布尔变量上升沿触发采集
- ✅ **实时响应**: 事件发生时立即采集数据
- ✅ **触发复位**: 支持采集后自动复位触发信号
- ✅ **多组并行**: 支持多个触发组并行工作
- ✅ **心跳信号**: 支持向 PLC 发送心跳，保持连接活跃

**典型应用场景：**
- 报警事件记录
- 设备故障捕获
- 工艺参数变更记录

### 3. 读取数据（查询回写）

查询回写功能从数据库读取历史数据并回写到 OPC UA 缓冲区，支持大批量数据的智能分批传输。

**主要特性：**
- ✅ **时间范围查询**: 支持按开始/结束时间查询历史数据
- ✅ **附加查询条件**: 支持自定义 SQL WHERE 条件
- ✅ **自定义时间字段**: 支持使用数据点中的时间字段进行查询
- ✅ **实时状态反馈**: 实时向 PLC 反馈查询状态（空闲/正在查询/成功/无数据/错误）
- ✅ **bNext 分批控制**: 单一布尔信号控制批次传输，简化 PLC 逻辑
- ✅ **递减式反馈**: 反馈值 = 剩余量 + 已发送量，实时追踪传输进度
- ✅ **超时保护**: 30 秒超时机制，防止死锁
- ✅ **大数据支持**: 支持超过缓冲区上限（10,000 条）的自动分批传输

**分批传输工作流程（25,000 条数据示例）：**

| 批次 | 本批发送量 | 累计已发送 | 反馈值 | PLC 动作 |
|------|-----------|-----------|--------|----------|
| 第 1 批 | 10,000 | 10,000 | **25,000** | 读取后触发 bNext↑ |
| 第 2 批 | 10,000 | 20,000 | **15,000** | 读取后触发 bNext↑ |
| 第 3 批 | 5,000 | 25,000 | **5000** | 传输完成 |

**状态码说明：**

| 状态码 | 含义 | 说明 |
|-------|------|------|
| 0 | 空闲 | 系统就绪，无查询任务 |
| 1 | 正在查询 | 数据库查询正在进行中 |
| 2 | 查询成功 | 查询完成且成功写入缓冲区 |
| 3 | 无数据 | 查询完成但没有数据返回 |
| 4 | 错误 | 查询过程中发生错误 |

**典型应用场景：**
- 历史报警查询回放
- 报表数据提取
- 数据统计分析

## 快速开始

### 环境要求
- Python 3.8+
- pip 包管理器
- MySQL 5.7+ 或 SQLite 3.x
- OPC UA 服务器

### 安装步骤

```bash
# 进入项目目录
cd SD_SMA_DATA_COLLECTOR

# 自动安装依赖（推荐）
python init.py

# 或手动安装
pip install -r requirements.txt
```

### 启动系统

```bash
# 启动数据采集（使用默认配置）
python main.py

# 指定配置文件
python main.py --config config/Alarm_Audit.json
```

系统启动后会：
- 连接所有配置的 OPC UA 服务器
- 初始化数据库连接
- 启动 HTTP 服务器（如果启用）
- 按照配置的触发方式采集数据
- 实时写入数据库

### 配置检查

```bash
# 检查配置文件格式
python check_config.py config/sample_config.json
```

### 系统控制

- **正常退出**: Ctrl+C 或发送终止信号
- **后台运行 (Linux)**:
  ```bash
  nohup python main.py > output.log 2>&1 &
  ```
- **Windows 启动**: `start_http.bat`
- **查看日志**: `tail -f data_collector.log`

## 系统架构

```
SD_SMA_DATA_COLLECTOR/
├── config/              # 配置文件目录
│   ├── sample_config.json      # 基础配置示例
│   ├── trend_config.json       # 趋势数据配置
│   ├── Alarm_Audit.json        # 报警审计配置
│   └── Alarm_trend.json        # 报警趋势配置
├── core/               # 核心模块
│   ├── config_models.py   # 配置数据模型（数据点、数据组、通信连接等）
│   └── config_loader.py   # 配置加载器和验证器
├── communication/      # 通信模块
│   ├── communication_manager.py  # 通信管理器（管理多个 OPC UA 连接）
│   ├── opcua_client.py    # OPC UA 客户端封装
│   ├── data_collector.py  # 数据采集器（时间/变量/查询触发）
│   ├── opcua_data_writer.py # OPC UA 数据写入器（查询结果回写）
│   ├── http_client.py     # HTTP 客户端（数据推送）
│   ├── heartbeat_manager.py # 心跳管理器（定时写入心跳信号）
│   └── date_and_time.py   # 日期时间工具函数
├── database/           # 数据库模块
│   ├── db_manager.py      # 数据库管理器（连接/断开/建表）
│   ├── data_storage.py    # 数据存储处理器（批量插入）
│   └── data_query.py      # 数据查询处理器（历史数据查询）
├── tests/              # 测试用例
│   ├── test_core.py              # 核心配置测试
│   ├── test_multi_communication.py # 多通信连接测试
│   ├── test_http_server.py       # HTTP 服务器测试
│   ├── test_opc_write.py         # OPC UA 写入测试
│   ├── test_mysql.py             # MySQL 数据库测试
│   └── trigger_query_test.py     # 查询触发测试
├── docs/               # 文档目录
│   ├── MULTI_COMMUNICATION.md   # 多控制器连接配置指南
│   ├── HTTP_SERVER_GUIDE.md     # HTTP 数据推送使用指南
│   ├── HTTP_QUICK_START.md      # HTTP 快速入门
│   ├── OPC_UA_CONFIG.md         # OPC UA 配置说明
│   ├── OPC_UA_WRITE_FIX.md      # OPC UA 写入问题修复记录
│   └── CHANGELOG.md             # 系统更新日志
├── js/                 # 前端资源
│   └── line_http.html   # HTTP 监控页面
├── main.py             # 主程序入口
├── init.py             # 依赖安装脚本
├── check_config.py     # 配置检查工具
├── requirements.txt    # Python 依赖包列表
├── README.md           # 项目说明文档
└── CHANGELOG.md        # 更新日志
```

## 配置说明

### 数据点配置 (points)
- `name`: 数据点唯一标识符
- `path`: OPC UA 节点路径（格式：ns=X;s=节点路径）
- `description`: 数据点描述信息
- `datatype`: （可选）数据类型，可选值：datetime、int、float、str、bool

### 数据组配置 (groups)
- `name`: 数据组名称
- `interval_seconds`: 采样/检查间隔（秒）
- `trigger`: 触发方式
  - `time`: 时间间隔触发
  - `variable`: 变量触发（由 PLC 信号触发）
  - `query`: 查询任务触发（读取配置并执行数据库查询）
- `data_points`: 包含的数据点名称列表
- `trigger_point`: 触发变量名称（仅 variable/query 类型需要）
- `reset_trigger_after_read`: 读取后是否复位触发信号
- `recreate_interval_days`: 数据库分表间隔天数
- `batch_insert_size`: 批量插入大小
- `query_config`: 查询配置（仅 query 类型）
  - `start_time_field`: 开始时间变量名
  - `end_time_field`: 结束时间变量名
  - `query_point_field`: 查询数据点变量名
  - `buffer_nodes`: OPC UA 缓冲区节点数组
  - `time_nodes`: 时间戳节点数组
  - `buffer_size`: 单个缓冲区容量（默认 10000）
  - `feed_back_point`: 查询状态反馈节点
  - `feed_back_nodes`: 缓冲区数据量反馈节点数组
  - `cmd_next_nodes`: 下一批请求信号节点（bNext 控制）
  - `by_what_time`: 查询时使用的时间字段名（默认 collection_time）
  - `aux_query_field`: 附加查询条件变量名

### 通信配置 (communications)
- `name`: 通信连接名称（唯一标识）
- `type`: 通信类型（目前仅支持 "opcua"）
- `host`: OPC UA 服务器地址
- `port`: OPC UA 服务器端口

### 连接配置 (connections)
- `name`: 连接配置名称（唯一标识）
- `communication`: 引用的通信名称
- `data_groups`: 使用该通信的数据组名称列表
- `heartbeat`: （可选）心跳信号的 OPC UA 地址，格式：`ns=X;s=节点路径`
  - 如果配置了该字段，系统会每隔 1 秒向该地址写入值 1（UInt16 类型）
  - 用于保持 PLC 连接活跃，防止超时断开
  - 示例：`"heartbeat": "ns=6;s=::DataRev:bHeartBeat"`

### 数据库配置 (database)
- `type`: 数据库类型（mysql/sqlite）
- `name`: 数据库名称
- `host/port/username/password`: 连接参数（MySQL 需要）
- `data_groups`: 要存储的数据组名称列表

### HTTP 服务器配置 (http_server)
- `enabled`: 是否启用 HTTP 推送
- `base_url`: HTTP 服务器地址
- `endpoint`: API 端点路径
- `timeout`: 请求超时时间（秒）
- `max_retries`: 失败重试次数
- `retry_delay`: 重试间隔（秒）

### 完整配置文件示例

```json
{
  "communications": [
    {
      "name": "PLC1",
      "type": "opcua",
      "host": "192.168.50.233",
      "port": 4840
    }
  ],
  "connections": [
    {
      "name": "connection1",
      "communication": "PLC1",
      "data_groups": ["sensor_group_1", "trigger_group_1"],
      "heartbeat": "ns=6;s=::DataRev:bHeartBeat"
    }
  ],
  "points": [
    {
      "name": "rEC",
      "path": "ns=6;s=::DataGen:EC",
      "description": "温度传感器数据"
    },
    {
      "name": "bTrigger1",
      "path": "ns=6;s=::DataRev:bTestTriger",
      "description": "触发信号"
    }
  ],
  "groups": [
    {
      "name": "sensor_group_1",
      "interval_seconds": 1,
      "trigger": "time",
      "description": "时间触发组，每 1 秒采集一次",
      "data_points": ["rEC", "rF10", "rF11"],
      "recreate_interval_days": 1,
      "batch_insert_size": 5
    },
    {
      "name": "trigger_group_1",
      "interval_seconds": 0.5,
      "trigger": "variable",
      "description": "变量触发组",
      "data_points": ["rF1", "rF2"],
      "trigger_point": "bTrigger1",
      "reset_trigger_after_read": false,
      "recreate_interval_days": 15,
      "batch_insert_size": 1
    }
  ],
  "database": {
    "type": "mysql",
    "name": "wn_10",
    "host": "192.168.50.22",
    "port": 3306,
    "username": "root",
    "password": "your_password",
    "data_groups": ["sensor_group_1", "trigger_group_1"]
  },
  "http_server": {
    "enabled": true,
    "base_url": "http://localhost:8080",
    "endpoint": "/api/data",
    "timeout": 30,
    "max_retries": 3,
    "retry_delay": 1.0
  }
}
```

### 心跳信号配置

在 `connections` 中添加 `heartbeat` 字段：

```json
{
  "connections": [
    {
      "name": "connection1",
      "communication": "PLC1",
      "data_groups": ["sensor_group_1", "sensor_group_2"],
      "heartbeat": "ns=6;s=::DataRev:bHeartBeat"
    }
  ]
}
```

### 查询状态反馈配置

```json
{
  "groups": [
    {
      "name": "query_group_1",
      "interval_seconds": 0.5,
      "trigger": "query",
      "description": "查询回写组",
      "data_points": ["strStartTimes", "strEndTimes", "strPointNames"],
      "trigger_point": "bTriggerQuery",
      "query_config": {
        "start_time_field": "strStartTimes",
        "end_time_field": "strEndTimes",
        "query_point_field": "strPointNames",
        "feed_back_point": "ns=6;s=::DataRev:uiQueryFeedback",
        "buffer_nodes": [
          "ns=6;s=::DataRev:stDbReadQuery.stRev[0].rRevBuffer"
        ],
        "time_nodes": [
          "ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevTime"
        ],
        "buffer_size": 10000
      }
    }
  ]
}
```

### bNext 分批控制配置

```json
"query_config": {
  "buffer_size": 10000,
  "cmd_next_nodes": [
    "ns=6;s=::DataRev:stDbReadQuery.stCmd.bNext"
  ],
  "feed_back_nodes": [
    "ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevFeedBack"
  ]
}
```

### 附加查询条件配置

```json
"query_config": {
  "aux_query_field": "strAuxQuery1",
  "start_time_field": "strStartTimes1",
  "end_time_field": "strEndTimes1",
  "by_what_time": "ts"
}
```

**附加查询条件示例：**
当 `strAuxQuery1` = `"code > 100"` 时，生成的 SQL：
```sql
SELECT `ts`, `code`, `msg` FROM `alarm_group_1_20260408` 
WHERE (`ts` BETWEEN '2026-04-01' AND '2026-04-08') AND (code > 100) 
ORDER BY `ts`
```

## 开发指南

### 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 运行特定测试
pytest tests/test_multi_communication.py -v
pytest tests/test_http_server.py -v
```

### 核心模块说明

1. **配置模块** (`core/`)
   - `config_models.py`: 定义数据点、数据组、通信连接等数据模型
   - `config_loader.py`: JSON 配置文件加载、解析和验证

2. **通信模块** (`communication/`)
   - `communication_manager.py`: 管理多个 OPC UA 客户端连接
   - `opcua_client.py`: OPC UA 客户端封装，支持断线重连
   - `data_collector.py`: 实现时间/变量/查询三种触发采集逻辑
   - `opcua_data_writer.py`: 查询结果回写到 OPC UA 缓冲区，支持状态反馈
   - `http_client.py`: HTTP 数据推送客户端
   - `heartbeat_manager.py`: 心跳信号管理，定时写入 OPC UA 保持连接活跃

3. **数据库模块** (`database/`)
   - `db_manager.py`: 数据库连接管理、自动建表
   - `data_storage.py`: 批量数据插入处理
   - `data_query.py`: 历史数据查询和导出

4. **主程序** (`main.py`)
   - 整合各模块，提供采集和查询两种运行模式
   - 支持 HTTP 服务器和客户端功能
   - 集成心跳管理和查询状态反馈

### 扩展开发

#### 添加新的触发方式
1. 在 `core/config_models.py` 中添加新的 TriggerType 枚举值
2. 在 `communication/data_collector.py` 中实现相应的触发逻辑
3. 更新配置验证逻辑

#### 扩展 HTTP 功能
1. 修改 `communication/http_client.py` 添加自定义请求头或认证
2. 在 `opcua_data_writer.py` 中调整发送数据格式
3. 参考 `docs/HTTP_SERVER_GUIDE.md` 实现 WebSocket/SSE 推送

### 性能优化

1. **优化批量大小**: 根据数据量调整 `batch_insert_size`，平衡内存和性能
2. **合理设置采集频率**: 避免过于频繁的数据采集影响 PLC 性能
3. **数据库定期维护**: 清理过期数据，优化索引结构
4. **监控系统资源**: 关注 CPU、内存和磁盘 IO 使用情况
5. **网络优化**: 对于远程 OPC UA 服务器，考虑网络延迟影响
6. **HTTP 推送性能**: 调整 timeout 和 max_retries 参数适应网络环境

### 故障排除

#### 常见问题

1. **OPC UA 连接失败**
   - 检查服务器地址和端口配置
   - 确认网络连通性（ping/telnet）
   - 验证 OPC UA 服务器是否运行
   - 检查防火墙设置

2. **数据库写入失败**
   - 检查数据库连接参数（用户名/密码/主机）
   - 确认数据库服务已启动
   - 查看数据库用户权限
   - 检查磁盘空间

3. **数据采集异常**
   - 查看详细日志 `data_collector.log`
   - 验证数据点 OPC UA 路径正确性
   - 检查触发变量状态
   - 确认数据组与通信连接映射正确

4. **查询回写不工作**
   - 确认 query_group 配置正确
   - 检查 bTriggerQuery 触发信号
   - 验证查询参数（时间范围/数据点）格式
   - 查看 OPC UA 缓冲区节点路径

#### 日志分析

```bash
# 查看最近的错误日志
tail -n 100 data_collector.log | grep ERROR

# 统计错误数量
grep -c "ERROR" data_collector.log

# 实时查看日志
tail -f data_collector.log
```

**日志级别:**
- INFO: 系统正常运行信息
- WARNING: 警告信息（重试/非关键错误）
- ERROR: 错误信息（连接失败/写入失败）
- DEBUG: 调试详细信息

## 许可证

MIT License

## 更新日志

详细的更新历史记录请查看 [CHANGELOG.md](CHANGELOG.md) 文件。

## 联系方式

如有问题或建议，请联系开发团队。