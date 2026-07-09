# AI 程序结构速查与问题定位指南

本文档给接手本项目的 AI 或工程师使用，目标是快速理解 `SD_SMA_DATA_COLLECTOR` 的程序结构、启动链路、数据流和常见问题定位入口。

适用目录：

```text
C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
```

## 1. 一句话总览

这是一个 OPC UA 数据采集程序：读取 JSON 配置，连接一个或多个 OPC UA 服务，按时间或触发信号采集点位，把数据按组批量写入 MySQL/SQLite；同时提供 Web 页面进行配置编辑、采集启停和运行监视。

核心链路：

```text
配置 JSON
  -> ConfigLoader 校验
  -> DataCollectionSystem 初始化
  -> CommunicationManager / OpcUaClient 连接 OPC UA
  -> DataCollector 按组采集
  -> DataStorageProcessor 排队、分表、判重、批次处理
  -> DatabaseManager 写入数据库
```

## 2. 目录结构

```text
SD_SMA_DATA_COLLECTOR/
├── main.py                         # CLI 入口：python main.py --config ...
├── start_collector.bat             # 单项目启动脚本
├── check_config.py                 # 配置检查脚本
├── README.md                       # 用户说明
├── CHANGELOG.md                    # 更新日志
├── config/                         # 采集配置 JSON
├── core/
│   ├── config_models.py            # 配置 dataclass 与枚举
│   └── config_loader.py            # JSON 解析、默认值、强校验
├── runtime/
│   └── collector_runtime.py        # DataCollectionSystem，运行时总编排
├── communication/
│   ├── communication_manager.py    # 多 OPC UA 连接管理
│   ├── opcua_client.py             # OPC UA 读写、重连、健康检查
│   ├── data_collector.py           # time / variable / time_and_variable 采集任务
│   ├── heartbeat_manager.py        # 心跳写入
│   └── opcua_feedback_writer.py    # 插入反馈码写回 OPC UA
├── database/
│   ├── db_manager.py               # 数据库连接、建表、表名、SQL 执行
│   └── data_storage.py             # 入库队列、批处理、分表、batch_upsert
├── web_config/
│   ├── main.py                     # FastAPI Web 入口
│   ├── collector_host.py           # Web 内托管采集器启停
│   ├── config_manager.py           # Web 配置读写与前置校验
│   ├── opcua_browser.py            # OPC UA 浏览点位
│   ├── models.py                   # Web API 请求模型
│   └── static/                     # 配置页、监视页前端
├── tests/                          # 单元测试和集成测试
└── docs/                           # 架构、测试、现场验证文档
```

## 3. 启动入口

### 3.1 Web 入口，推荐日常使用

启动：

```powershell
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
```

主要文件：

```text
web_config/main.py
web_config/collector_host.py
runtime/collector_runtime.py
```

启动路径：

```text
web_config/main.py
  -> /api/collector/start
  -> CollectorHost.start()
  -> DataCollectionSystem(config_path)
  -> initialize()
  -> start()
```

Web 相关页面：

```text
/config     配置编辑页
/dashboard 采集监视页
/api/*      配置、OPC UA 浏览、采集启停 API
```

### 3.2 CLI 入口

启动：

```powershell
python main.py --config config/sample_config.json
```

启动路径：

```text
main.py
  -> run_collection_mode(config_file)
  -> DataCollectionSystem.initialize()
  -> DataCollectionSystem.start()
```

注意：Web 托管采集和 CLI 采集不要同时连接同一配置、同一数据库运行，避免重复采集和重复写入。

## 4. 配置加载链路

核心文件：

```text
core/config_models.py
core/config_loader.py
web_config/config_manager.py
web_config/static/config.js
```

配置文件结构：

```text
communications  OPC UA 服务配置
connections     数据组和通信连接的映射
points          OPC UA 点位定义
groups          数据组、触发方式、批量写入、分表、batch_upsert
database        数据库连接和落库组
logging         日志目录和级别
```

重要校验位置：

```text
ConfigLoader._validate_config()
CollectorConfigManager._validate_scope()
CollectorConfigManager._validate_points_unique()
CollectorConfigManager._validate_by_loader()
```

常见配置错误优先看：

```text
core/config_loader.py
web_config/config_manager.py
```

## 5. 运行时初始化流程

核心类：

```text
runtime.collector_runtime.DataCollectionSystem
```

主要方法：

```text
setup_logging()          初始化日志
initialize()             加载配置、连接 OPC UA、连接数据库、配置存储处理器
start()                  启动心跳、入库循环、DB 健康检查、采集任务
stop()                   停止采集、心跳、入库、数据库和 OPC UA 连接
get_runtime_snapshot()   给 Web 监视页提供运行状态
```

初始化顺序：

```text
1. ConfigLoader.load_from_file()
2. setup_logging()
3. CommunicationManager.initialize_connections()
4. HeartbeatManager(...)
5. DatabaseManager.connect()
6. DataStorageProcessor(...)
7. 注入每个数据组的 batch_size / unique_key / data_points / partition_interval_years / batch_upsert / indexes
8. DataStorageProcessor.initialize_tables_for_runtime()
9. DataCollector(...)
10. register_data_callback(_on_data_received)
```

如果程序启动失败，优先沿这个顺序定位。

## 6. OPC UA 通信与采集

### 6.1 通信管理

文件：

```text
communication/communication_manager.py
communication/opcua_client.py
```

职责：

```text
CommunicationManager
  - 根据 communications 创建 OpcUaClient
  - 维护 group -> communication 映射
  - 提供 get_client_for_group()

OpcUaClient
  - connect / disconnect
  - read_data_points()
  - write_boolean_value()
  - write_uint16_value()
  - write_array_value()
  - 断线重连和健康检查
```

OPC UA 读点失败、PLC 重启后重连、心跳写入失败，优先看：

```text
communication/opcua_client.py
communication/communication_manager.py
communication/heartbeat_manager.py
tests/test_opcua_reconnect.py
```

### 6.2 采集任务

文件：

```text
communication/data_collector.py
```

触发模式：

```text
time               按 interval_seconds 周期采集
variable           检测 trigger_point 上升沿后采集
time_and_variable  周期采集 + 上升沿立即采集
is_parallel=true   variable 模式下，布尔数组触发，数组点位按索引拆行
```

采集成功后的回调：

```text
DataCollector
  -> callback(collection_data)
  -> DataCollectionSystem._on_data_received()
  -> DataStorageProcessor.add_data()
```

如果“OPC UA 有值但数据库没有数据”，按顺序查：

```text
1. data_collector.py 是否产生 collection_data
2. collector_runtime.py 的 _on_data_received 是否入队
3. data_storage.py 的队列是否达到 batch 或被结批强制 flush
4. db_manager.py 的 execute_insert 是否成功
```

## 7. 数据库存储链路

核心文件：

```text
database/db_manager.py
database/data_storage.py
```

### 7.1 DatabaseManager

职责：

```text
connect()                  建立 MySQL/SQLite 连接
ensure_connection()        后台健康检查与断线重连
create_data_table()        CREATE TABLE IF NOT EXISTS
create_indexes()           创建索引
get_current_table_name()   根据组名、年份、固定表名参数计算表名
execute_query()            查询
execute_insert()           插入
execute_update()           更新
record_exists()            唯一键存在性检查
```

表名规则入口：

```text
DatabaseManager.get_current_table_name()
DatabaseManager._format_year_table_name()
```

### 7.2 DataStorageProcessor

职责：

```text
add_data()                             入队
start_processing()                     启动后台处理循环
initialize_tables_for_runtime()        启动时集中检查表
_process_data_by_groups()              按组和 batch_size 取可处理数据
_process_group_data()                  转换、判重、插入、反馈
_get_table_name_for_data_item()        决定当前记录写入哪个表
_handle_batch_upsert_conflict()        批次主表结批更新
_write_insert_feedback_by_outcome()    按结果写入反馈码
```

常见入库问题优先看：

```text
database/data_storage.py
database/db_manager.py
runtime/collector_runtime.py
```

## 8. 批次主表与年份分表

这是当前项目的重要逻辑。

核心规则：

```text
1. 同一配置最多一张 batch_upsert.enabled=true 的批次主表。
2. 批次主表固定表名，不加年份后缀。
3. 非主表必须包含批次主表的批次号点位。
4. 非主表按批次主表的开批时间年份归表。
5. 未结批不跨表，即自然时间跨年也继续写开批年份表。
6. 结批成功后强制写入队列内所有明细数据，不等待 batch_insert_size。
7. partition_interval_years 合法范围 0..10：0=不分表（表名无后缀），1..10=年份桶大小。
8. recreate_interval_days 是旧字段，保留兼容，不参与分表。
```

关键字段：

```text
groups[].partition_interval_years
groups[].unique_key_point
groups[].batch_upsert.enabled
groups[].batch_upsert.start_time_point
groups[].batch_upsert.end_time_point
```

关键代码：

```text
core/config_loader.py
  - 只允许一张 batch_upsert 主表
  - 非主表必须包含主表批次号点位

runtime/collector_runtime.py
  - 将 batch_master_group_name / batch_master_config / group_data_points 注入 DataStorageProcessor

database/data_storage.py
  - initialize_tables_for_runtime()
  - _load_open_batch_context()
  - _set_current_batch_context()
  - _mark_current_batch_closed()
  - _is_batch_close_record()
  - _get_table_name_for_data_item()
  - _process_data_by_groups()

database/db_manager.py
  - get_current_table_name()
  - _format_year_table_name()
```

年份桶与表名示例：

```text
partition_interval_years=0:
表名 = group_name（无后缀）

partition_interval_years=1:
2025 -> _y2025_span1
2026 -> _y2026_span1

partition_interval_years=2:
2025 -> _y2025_span2
2026 -> _y2025_span2
2027 -> _y2027_span2
2028 -> _y2027_span2
```

相关测试：

```text
tests/test_batch_year_partition.py
tests/test_insert_feedback_and_unique.py
docs/AI_BATCH_PARTITION_LIVE_TEST_REPORT_20260708.md
```

## 9. Web 配置与监视

核心文件：

```text
web_config/main.py
web_config/config_manager.py
web_config/collector_host.py
web_config/opcua_browser.py
web_config/static/config.js
web_config/static/dashboard.js
```

API 定位：

```text
GET  /api/config/files          配置文件列表
GET  /api/config/file           读取配置
POST /api/config/validate       校验配置
POST /api/config/write          写入 config/
POST /api/collector/start       Web 内启动采集
POST /api/collector/stop        停止采集
GET  /api/collector/status      运行状态
GET  /api/collector/logs        内存环形日志
POST /api/opcua/connect         OPC UA 浏览连接
GET  /api/opcua/browse          浏览节点
GET  /api/opcua/node            节点元数据
```

如果页面字段显示、保存、校验有问题，优先看：

```text
web_config/static/config.js
web_config/config_manager.py
core/config_loader.py
```

如果采集监视页状态不对，优先看：

```text
web_config/static/dashboard.js
web_config/main.py
web_config/collector_host.py
runtime/collector_runtime.py:get_runtime_snapshot()
```

## 10. 心跳与插入反馈

### 10.1 心跳

文件：

```text
communication/heartbeat_manager.py
communication/opcua_client.py
```

配置：

```text
connections[].heartbeat
```

推荐填 `points[].name`，仍兼容直接填 `ns=...`。

### 10.2 插入反馈

文件：

```text
database/data_storage.py
runtime/collector_runtime.py
communication/opcua_feedback_writer.py
```

配置：

```text
groups[].insert_feedback.feedback_point
groups[].insert_feedback.code_success
groups[].insert_feedback.code_unique_conflict
groups[].insert_feedback.code_db_error
groups[].insert_feedback.code_other_error
```

反馈流程：

```text
DataStorageProcessor._process_group_data()
  -> 统计 success / unique_conflict / db_error / other_error
  -> _write_insert_feedback_by_outcome()
  -> DataCollectionSystem._write_insert_feedback()
  -> OpcUaFeedbackWriter.write_udint_feedback()
```

## 11. 日志位置和排障入口

默认日志：

```text
logs/data_collector.log
```

如果配置了：

```text
logging.output_dir
```

则日志写到该目录下的 `data_collector.log`。

Web 托管时，`collector_host.py` 还会把日志复制到内存环形缓冲，供 `/api/collector/logs` 和监视页使用。

常用环境变量：

```text
SD_SMA_LOG_LEVEL                    覆盖日志级别
SD_SMA_LOG_DIR                      覆盖日志目录
SD_SMA_SQL_LOG_INFO=true            将 MySQL SQL 日志提升到 INFO
SD_SMA_DB_TRACEBACK=true            数据库异常打印 traceback
SD_SMA_DB_HEALTH_CHECK_INTERVAL     数据库健康检查间隔
SD_SMA_OPCUA_LOG_THROTTLE_INTERVAL  OPC UA 重连日志限流间隔
```

## 12. 常见问题定位表

| 现象 | 优先看哪里 | 重点检查 |
|---|---|---|
| 程序启动失败 | `runtime/collector_runtime.py:initialize()` | 配置加载、OPC UA 初始化、数据库连接、表初始化 |
| 配置页保存失败 | `web_config/config_manager.py`、`core/config_loader.py` | 字段范围、点位重复、组引用、batch_upsert 约束 |
| 配置加载提示必须包含批次号点位 | `core/config_loader.py` | 非主表 `data_points` 是否包含主表 `unique_key_point` |
| OPC UA 连接失败 | `communication/opcua_client.py`、`communication/communication_manager.py` | 地址端口、防火墙、PLC 服务、重连日志 |
| PLC 重启后未恢复 | `communication/opcua_client.py` | `_attempt_reconnect()`、健康检查任务、日志限流 |
| 采集没有入库 | `communication/data_collector.py`、`database/data_storage.py` | 是否采集到有效值、是否入队、是否达到 batch 或结批 flush |
| 数据写错年份表 | `database/data_storage.py:_get_table_name_for_data_item()`、`database/db_manager.py:get_current_table_name()` | 批次上下文、开批时间、`partition_interval_years` |
| 结批后明细没写入 | `database/data_storage.py:_is_batch_close_record()`、`_process_data_by_groups()`、`_mark_current_batch_closed()` | 主表是否先处理、结批时间是否有效、是否触发强制 flush |
| 批次主表重复数据 | `database/data_storage.py:_handle_batch_upsert_conflict()` | `unique_key_point`、end_time 是否为空、幂等配置 |
| 数据库断线 | `database/db_manager.py` | `ensure_connection()`、重连参数、SQLAlchemy 错误 |
| 建表失败 | `database/db_manager.py:create_data_table()` | 列名、datatype、权限、表名、SQL 日志 |
| 插入反馈没写回 | `database/data_storage.py`、`runtime/collector_runtime.py`、`opcua_feedback_writer.py` | feedback_point 是否引用 points、OPC UA 写权限 |
| 心跳没写入 | `communication/heartbeat_manager.py` | `connections[].heartbeat` 是否能解析到点位路径 |
| Web 启停状态不对 | `web_config/collector_host.py` | `_phase`、`_task`、`last_error`、内存日志 |

## 13. 测试入口

常用测试命令：

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR

..\..\.venv\Scripts\python.exe -m pytest tests\test_batch_year_partition.py tests\test_insert_feedback_and_unique.py tests\test_core.py

..\..\.venv\Scripts\python.exe -m pytest tests --ignore=tests\test_time.py --ignore=tests\test_mysql.py
```

测试文件定位：

```text
tests/test_core.py                         配置模型、加载、基础数据库表名
tests/test_multi_communication.py          多通信配置校验
tests/test_multi_group.py                  多数据组配置校验
tests/test_insert_feedback_and_unique.py   唯一键、insert_feedback、batch_upsert
tests/test_batch_year_partition.py         批次主表与年份分表
tests/test_opcua_reconnect.py              OPC UA 重连和心跳写入
tests/test_datatype.py                     datatype 解析和列类型推断
tests/test_mysql.py                        手动/环境相关 MySQL 连接测试
```

## 14. AI 接手排障建议流程

1. 先确认用户正在用 Web 托管还是 CLI 启动。
2. 读取 `git status --short`，不要覆盖用户未提交改动。
3. 读取用户指定配置文件，确认 `communications`、`connections`、`groups`、`database.data_groups` 是否一致。
4. 跑配置加载：

```powershell
..\..\.venv\Scripts\python.exe - <<'PY'
from core.config_loader import ConfigLoader
ConfigLoader.load_from_file("config/sample_config.json")
print("CONFIG_OK")
PY
```

5. 如果是启动失败，沿 `DataCollectionSystem.initialize()` 顺序查。
6. 如果是采集失败，沿 `DataCollector -> _on_data_received -> DataStorageProcessor.add_data -> _process_group_data -> DatabaseManager.execute_insert` 查。
7. 如果是分表问题，先确认是否有批次主表；有批次主表时，一切明细表名以主表开批时间为准。
8. 如果是 Web 页面问题，先看 `web_config/static/config.js`，再看 `web_config/config_manager.py` 和 `core/config_loader.py`。
9. 修改后至少跑相关单测；涉及前端 JS 时跑 `node --check web_config/static/config.js`。
10. 最终说明时写清楚：改了哪些文件、验证了哪些命令、是否有未清理测试数据或未提交文件。

## 15. 已废弃或不要再扩展的方向

这些旧能力已经删除或停止维护，定位问题时不要再按旧链路寻找：

```text
trigger=query
groups[].query_config
groups[].output_mode
顶层 http_server
历史查询回写队列
数据库历史查询处理器
OPC UA 查询缓冲区写入器
```

如果配置中出现这些字段，当前版本应该直接拒绝加载，而不是静默兼容。
