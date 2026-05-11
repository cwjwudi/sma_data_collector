# SMA 数据采集系统

一个工业数据采集系统，支持多 OPC UA 控制器连接，具备 MySQL/SQLite 数据库存储、Web 配置运维与查询回写（保留）能力。

## 功能说明

### 1. 定时采集

定时采集模式按照预设的时间间隔自动从 OPC UA 服务器读取数据并存储到数据库。

**主要特性：**
- ✅ **时间间隔触发**: 按照配置的间隔自动采集数据
- ✅ **单调时钟节拍控制**: 使用 `time.monotonic()` 对齐采样节拍，降低循环执行耗时导致的周期漂移
- ✅ **超时不追欠拍**: 当单轮处理超时，下一拍自动重置为“当前时刻 + interval”，避免连续追赶历史节拍
- ✅ **多数据点支持**: 每个数据组支持多个数据点同时采集
- ✅ **灵活配置**: 可为不同数据组设置不同的采集间隔
- ✅ **批量存储**: 支持批量数据插入，提高数据库写入效率
- ✅ **自动分表**: 按日期自动创建新表，支持自定义分表周期
- ✅ **按组批量读取 OPC UA**: 优先单次往返批量读取，失败时自动回退逐点读取

**典型应用场景：**
- 传感器数据周期性采集
- 生产设备状态监控
- 能耗数据记录

### 2. 触发采集

触发采集模式由 PLC 或其他外部信号触发，当触发条件满足时执行数据采集。

**主要特性：**
- ✅ **变量触发**: 由 PLC 布尔变量上升沿触发采集
- ✅ **时间+变量混合触发**: 支持 `time_and_variable`（定时采集 + 上升沿立即采集）
- ✅ **并行触发（数组触发）**: 支持 `is_parallel: true`，一次可处理多个触发位上升沿
- ✅ **并行触发自动拆行入库**: 触发数组对应的多索引结果会拆成多条标量记录（含 `trigger_index`）
- ✅ **实时响应**: 事件发生时立即采集数据
- ✅ **触发复位**: 支持采集后自动复位触发信号
- ✅ **多组并行**: 支持多个触发组并行工作
- ✅ **心跳信号**: 支持向 PLC 发送心跳，保持连接活跃

**典型应用场景：**
- 报警事件记录
- 设备故障捕获
- 工艺参数变更记录
- 多工位并行触发快照采集

### 3. 读取数据（PLC 回写，仅保留）

查询回写功能用于从数据库读取历史数据并回写到 OPC UA 缓冲区。当前阶段该能力仅做存量维护与兼容，原则上不再新增功能开发。

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

### 4. Web 配置界面（web_config）

`web_config` 是当前推荐的运行入口，负责“配置管理 + 采集托管 + 运行监视”。

**主要特性：**
- ✅ **统一入口**: 在浏览器内完成配置编辑、校验、导出与采集控制
- ✅ **采集托管**: 通过 Web 页面启动/停止采集，避免命令行误操作
- ✅ **运行监视**: 展示数据库连通、OPC UA 连接状态、主循环状态与最近日志
- ✅ **配置可视化**: 支持读取/直写 `config/` 下 JSON 与 OPC UA 浏览加点位

**设计边界：**
- `web_config` 目前仍不支持 `trigger=query` 与 `groups[].query_config` 的可视化编辑
- PLC 回写链路保持可用，但不作为后续新功能扩展方向

### 5. v1.3.0+ 版本增强（重点）

- **v1.3.0 - 附加查询条件（aux_query）**
  - 在 `query_config` 中支持 `aux_query_field`，可从 OPC UA 读取附加 SQL 条件并拼接到 `WHERE`。
  - 支持按 `aux_query` 维度分组执行查询，避免不同条件互相覆盖。

- **v1.3.1 - 并行触发（Parallel）**
  - `trigger: variable` + `is_parallel: true`：`trigger_point` 为布尔数组，`data_points` 为同下标数组。
  - 单次轮询可识别多个上升沿，并按索引拆成多条记录写入数据库。

- **v1.3.2 - 并行入库与吞吐优化**
  - 并行触发结果在回调前拆分为标量行，避免数组值直接入库导致 SQL 错误。
  - 批处理队列达到阈值后使用事件立即唤醒写入循环，减少固定 sleep 带来的延迟。

- **v1.3.3 - `time_and_variable` 混合触发**
  - 在固定周期采集基础上，增加触发点上升沿即时采集。
  - 该模式要求 `trigger_interval_seconds > 0`，且不支持 `is_parallel: true`。

- **v1.3.4 - 采样节拍与读点优化**
  - 纯时间触发改为单调时钟节拍驱动，降低累计漂移。
  - OPC UA 读点优先按组批量读取，失败自动回退逐点读，兼顾性能与稳定性。

- **v1.3.5 - 日志系统配置化**
  - 新增 `logging` 配置（目录、保留、轮转、控制台输出）与默认值/容错策略。
  - 日志支持按策略轮转，异常日志统一带堆栈，高频成功日志降噪到 `DEBUG`。

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

# 安装开发/测试依赖（pytest、black、flake8、asyncua 等）
python init.py --dev

# 或手动安装
pip install -r requirements.txt

# 手动安装开发依赖
pip install -r requirements-dev.txt
```

### Web 界面与采集（推荐）

```bash
# Windows：一键启动（浏览器内「采集监视」面板再点「启动采集」）
start_collector.bat

# 或手动启动
# 依赖见根目录 requirements.txt
pip install -r requirements.txt
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
```

- 访问地址：`http://127.0.0.1:8091`（或本机 IP:8091）
- 页面顶部 **采集监视**：选择 `config/` 下 JSON 后点击 **启动采集** / **停止采集**；在此启动前不会进行采集。
- 监视区会轮询数据库连通、各 OPC UA 连接、采集主循环是否在跑，并展示与 `data_collector.log` / 控制台同源的最近日志（内存环形缓冲）。
- 作为 v1.5 推荐用法，日常配置变更与运行管理优先通过 `web_config` 完成。
- 同一进程内请勿再运行 `python main.py` 连接同一数据库做采集，避免重复占库。
- 其余：读取/编辑/校验配置、导出与直写 `config/`、OPC UA 浏览加点位等。
- 设计边界：配置网页仍不支持 `trigger=query` 与 `groups[].query_config`

### 命令行采集（可选）

```bash
# 不开 Web、仅控制台运行采集
python main.py

# 指定配置文件
python main.py --config config/Alarm_Audit.json
```

命令行模式适用脚本/服务部署；与 Web 托管采集二选一即可。

`python main.py` 启动后会：

- 连接所有配置的 OPC UA 服务器
- 初始化数据库连接
- 按配置的触发方式采集数据并写入数据库

（主程序内已移除 HTTP 推流/内置 HTTP 服务；配置里 `http_server` 若启用会被忽略并打日志警告。）

### 配置检查

```bash
# 检查配置文件格式
python check_config.py config/sample_config.json
```

### 系统控制

- **正常退出**: Ctrl+C 或发送终止信号
  - Python 3.12 下已适配 `CancelledError/KeyboardInterrupt` 协同处理，Ctrl+C 会执行完整 stop 流程并尽量避免额外 traceback 噪声
- **后台运行 (Linux)**:
  ```bash
  nohup python main.py > output.log 2>&1 &
  ```
- **Windows 启动**: `python main.py`
- **查看日志**: `tail -f logs/data_collector.log`

## 系统架构

```
SD_SMA_DATA_COLLECTOR/
├── config/              # 配置文件目录
│   ├── sample_config.json      # 基础配置示例
│   ├── trend_config.json       # 趋势数据配置
│   ├── time_and_variable_config.json # time_and_variable 触发模式示例
│   ├── time_and_variable_logging_config.json # 日志参数配置示例
│   ├── Alarm_Audit.json        # 报警审计配置
│   └── Alarm_trend.json        # 报警趋势配置
├── core/               # 核心模块
│   ├── config_models.py   # 配置数据模型（数据点、数据组、通信连接等）
│   └── config_loader.py   # 配置加载器和验证器
├── communication/      # 通信模块
│   ├── communication_manager.py  # 通信管理器（管理多个 OPC UA 连接）
│   ├── opcua_client.py    # OPC UA 客户端封装
│   ├── data_collector.py  # 数据采集器（时间/变量/时间+变量/查询触发）
│   ├── opcua_data_writer.py # OPC UA 数据写入器（查询结果回写）
│   ├── heartbeat_manager.py # 心跳管理器（定时写入心跳信号）
│   └── date_and_time.py   # 日期时间工具函数
├── web_config/         # Web 配置与采集托管模块（推荐入口）
│   ├── main.py            # FastAPI 应用入口
│   ├── static/            # 前端页面与静态资源
│   └── ...                # Web API 与配置服务实现
├── database/           # 数据库模块
│   ├── db_manager.py      # 数据库管理器（连接/断开/建表）
│   ├── data_storage.py    # 数据存储处理器（批量插入）
│   └── data_query.py      # 数据查询处理器（历史数据查询）
├── tests/              # 测试用例
│   ├── test_core.py              # 核心配置测试
│   ├── test_multi_communication.py # 多通信连接测试
│   ├── test_opc_write.py         # OPC UA 写入测试
│   ├── test_mysql.py             # MySQL 数据库测试
│   └── trigger_query_test.py     # 查询触发测试
├── docs/               # 文档目录
│   ├── MULTI_COMMUNICATION.md   # 多控制器连接配置指南
│   ├── OPC_UA_CONFIG.md         # OPC UA 配置说明
│   ├── OPC_UA_WRITE_FIX.md      # OPC UA 写入问题修复记录
│   └── CHANGELOG.md             # 系统更新日志
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
  - `time_and_variable`: 定时采集 + 变量上升沿立即采集（需配置 `trigger_interval_seconds`）
  - `query`: 查询任务触发（读取配置并执行数据库查询）
- `data_points`: 包含的数据点名称列表
- `trigger_point`: 触发变量名称（仅 variable/query 类型需要）
- `trigger_interval_seconds`: 触发点轮询间隔（仅 `time_and_variable` 必填，必须 > 0）
- `reset_trigger_after_read`: 读取后是否复位触发信号
- `is_parallel`: 是否启用并行触发模式（仅 `trigger: variable` 可用）
- `output_mode`: 查询结果输出方式（当前仅保留 `opcua_only`；历史 HTTP 相关模式不再开发）
- `recreate_interval_days`: 数据库分表间隔天数
- `batch_insert_size`: 批量插入大小
- `unique_key_point`: （可选）组内唯一性校验键（必须在 `data_points` 中）
- `insert_feedback`: （可选）插入反馈配置（UDINT）
  - `feedback_point`: 插入结果反馈点名称（需先在 `points` 中定义，再在此引用）
  - `code_success`: 全部成功时回写码（默认 `0`）
  - `code_unique_conflict`: 唯一性冲突时回写码（默认 `1`）
  - `code_db_error`: 数据库错误时回写码（默认 `2`）
  - `code_other_error`: 其他失败时回写码（默认 `3`）
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

**触发配置约束：**
- `time_and_variable` 模式下，`trigger_point` 与 `trigger_interval_seconds` 必须配置，且 `is_parallel` 必须为 `false`。
- 并行触发模式（`trigger: variable` + `is_parallel: true`）下，`trigger_point` 应为布尔数组节点，`data_points` 应为与触发数组同下标语义的数组节点。
- 配置了 `unique_key_point` 时，系统会在插入前按该列做表内判重，重复数据不落库并返回唯一性冲突码。

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

### 历史 HTTP 配置兼容 (http_server)
- HTTP 推流能力已移除，不再提供任何 HTTP 数据发送功能。
- 若配置文件中存在 `http_server` 且 `enabled=true`，系统会记录 `WARNING` 并自动忽略，不会中断启动。
- 该配置段仅用于历史兼容，可逐步从配置中删除。

### 日志配置 (logging)
- `level`: 日志级别（`DEBUG/INFO/WARNING/ERROR/CRITICAL`，默认 `INFO`）
- `output_dir`: 日志输出目录（支持相对/绝对路径）
  - 相对路径按 `main.py` 所在目录解析
  - 优先级：`logging.output_dir` > 环境变量 `SD_SMA_LOG_DIR` > 默认 `logs`
- `backup_days`: 历史轮转日志保留数量（默认 `14`）
- `rotation_when`: 轮转单位（`S/M/H/D/midnight/W0-W6`，默认 `midnight`）
- `rotation_interval`: 轮转间隔倍数（默认 `1`）
  - 实际周期 = `rotation_when` × `rotation_interval`
- `console_enabled`: 是否输出到控制台（默认 `true`）

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
    },
    {
      "name": "udiInsertFeedBack",
      "path": "ns=6;s=::DataRev:udiInsertFeedBack",
      "description": "插入反馈码（UDINT）"
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
      "unique_key_point": "rF1",
      "insert_feedback": {
        "feedback_point": "udiInsertFeedBack",
        "code_success": 0,
        "code_unique_conflict": 1,
        "code_db_error": 2,
        "code_other_error": 3
      },
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
  "logging": {
    "level": "INFO",
    "output_dir": "logs",
    "backup_days": 14,
    "rotation_when": "midnight",
    "rotation_interval": 1,
    "console_enabled": true
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

### 并行触发配置（v1.3.1+）

```json
{
  "name": "pallel_group_1",
  "interval_seconds": 0.5,
  "trigger": "variable",
  "is_parallel": true,
  "data_points": ["rF1", "rF2", "rF3"],
  "trigger_point": "bTrigger1",
  "reset_trigger_after_read": true,
  "batch_insert_size": 1
}
```

并行模式运行要点：
- `bTrigger1` 为布尔数组（如 `[false, true, false, ...]`），系统检测每个索引的上升沿。
- `data_points` 对应数组按同索引取值，并拆分为多条标量记录写入数据库。
- 拆分记录可带 `trigger_index`，用于定位具体工位/通道。

### time_and_variable 配置（v1.3.3+）

```json
{
  "name": "time_and_variable_group_2",
  "interval_seconds": 5,
  "trigger": "time_and_variable",
  "trigger_interval_seconds": 0.5,
  "trigger_point": "bTrigger1",
  "is_parallel": false
}
```

混合触发运行要点：
- 每 `interval_seconds` 执行一次定时采集。
- 每 `trigger_interval_seconds` 检测触发点上升沿，出现上升沿时立即采集。
- 该模式用于“周期采样 + 事件快照”并存场景。

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
```

### 核心模块说明

1. **配置模块** (`core/`)
   - `config_models.py`: 定义数据点、数据组、通信连接等数据模型
   - `config_loader.py`: JSON 配置文件加载、解析和验证

2. **通信模块** (`communication/`)
   - `communication_manager.py`: 管理多个 OPC UA 客户端连接
   - `opcua_client.py`: OPC UA 客户端封装，支持断线重连
   - `data_collector.py`: 实现时间/变量/查询三种触发采集逻辑
   - `opcua_data_writer.py`: 查询结果回写到 OPC UA 缓冲区，支持状态反馈（保留维护）
   - `heartbeat_manager.py`: 心跳信号管理，定时写入 OPC UA 保持连接活跃

3. **数据库模块** (`database/`)
   - `db_manager.py`: 数据库连接管理、自动建表
   - `data_storage.py`: 批量数据插入处理
   - `data_query.py`: 历史数据查询和导出

4. **主程序** (`main.py`)
   - 整合各模块，提供采集和查询两种运行模式
   - HTTP 推流功能已移除，`http_server` 配置仅做兼容忽略
   - 集成心跳管理和查询状态反馈

### 扩展开发

#### 添加新的触发方式
1. 在 `core/config_models.py` 中添加新的 TriggerType 枚举值
2. 在 `communication/data_collector.py` 中实现相应的触发逻辑
3. 更新配置验证逻辑

#### 扩展 Web 配置能力
1. 在 `web_config/main.py` 增加或调整 API 路由
2. 在 `web_config/static/` 调整前端页面交互与表单校验
3. 保持与 `core/config_loader.py` 的配置校验规则一致

### 性能优化

1. **优化批量大小**: 根据数据量调整 `batch_insert_size`，平衡内存和性能
2. **合理设置采集频率**: 避免过于频繁的数据采集影响 PLC 性能
3. **数据库定期维护**: 清理过期数据，优化索引结构
4. **监控系统资源**: 关注 CPU、内存和磁盘 IO 使用情况
5. **网络优化**: 对于远程 OPC UA 服务器，考虑网络延迟影响
6. **Web 运维稳定性**: 通过 `web_config` 统一启停采集并观察日志，避免重复启动

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
   - 查看详细日志 `logs/data_collector.log`
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
tail -n 100 logs/data_collector.log | grep ERROR

# 统计错误数量
grep -c "ERROR" logs/data_collector.log

# 实时查看日志
tail -f logs/data_collector.log
```

**日志轮转建议：**
- 生产环境建议：`rotation_when=midnight`、`rotation_interval=1`、`backup_days=14~30`。
- 若要降低控制台噪声，可设置 `console_enabled=false` 仅保留文件日志。
- 稳定运行建议将 `level=INFO`；排障时再临时调整为 `DEBUG`。

**MySQL SQL 明细日志：**
- 系统支持打印 MySQL SQL 语句与参数（建表/查询/插入）。
- 默认仅在 `DEBUG` 可见；若要在 `INFO` 级别查看，可设置环境变量：

```bash
# Windows PowerShell
$env:SD_SMA_SQL_LOG_INFO="true"
python main.py --config config/sample_config.json
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