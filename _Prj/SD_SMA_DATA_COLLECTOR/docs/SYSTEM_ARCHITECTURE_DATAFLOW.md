# 系统架构与数据流

当前版本只保留数据采集、入库、Web 配置托管、心跳和插入反馈能力。历史查询回写链路已删除；配置中不再支持 `trigger=query`、`groups[].query_config`、`groups[].output_mode` 和顶层 `http_server`。

## 分层结构

```text
应用入口
├── main.py                         # CLI 采集入口
└── web_config/main.py              # FastAPI 配置与监视入口

运行时编排
└── runtime/collector_runtime.py     # DataCollectionSystem

配置层
├── core/config_models.py            # 配置数据模型
└── core/config_loader.py            # JSON 解析与校验

通信与采集
├── communication/communication_manager.py
├── communication/opcua_client.py
├── communication/data_collector.py
├── communication/heartbeat_manager.py
└── communication/opcua_feedback_writer.py

数据库
├── database/db_manager.py
└── database/data_storage.py
```

## 启动路径

1. `main.py` 解析 `--config` 后调用 `run_collection_mode()`。
2. `web_config/main.py` 通过 `/api/collector/start` 调用 `CollectorHost.start()`，在 Uvicorn 事件循环中托管同一个 `DataCollectionSystem`。
3. `DataCollectionSystem.initialize()` 加载配置、初始化 OPC UA 通信、心跳管理器、数据库连接和存储处理器。
4. `DataCollectionSystem.start()` 启动心跳、存储处理循环、数据库健康检查和各数据组采集任务。

## 采集数据流

```text
DataCollector
  ├─ 按组读取 OPC UA 数据点
  ├─ time / variable / time_and_variable 触发
  └─ 回调 DataCollectionSystem._on_data_received()

DataCollectionSystem
  └─ DataStorageProcessor.add_data()

DataStorageProcessor
  ├─ 按组排队与批量处理
  ├─ 自动建表/分表
  ├─ 唯一键判重与 batch_upsert
  └─ DatabaseManager 写入 MySQL/SQLite
```

## 支持的触发方式

- `time`: 按 `interval_seconds` 周期采集。
- `variable`: 监听触发点上升沿后采集，可选 `is_parallel` 数组触发。
- `time_and_variable`: 周期采集与上升沿即时采集并存。

## 反馈与心跳

- `HeartbeatManager` 根据 `connections[].heartbeat` 定时向 PLC 写入心跳。
- `DataStorageProcessor` 根据入库结果计算 `insert_feedback` 状态码。
- `OpcUaFeedbackWriter` 将 UDINT 反馈码写回对应 OPC UA 节点。

## Web 配置边界

`web_config` 只允许编辑当前采集配置字段：`communications`、`connections`、`points`、`groups`、`database`、`logging`。加载或保存包含旧查询回写字段的配置会直接报错，避免静默丢失配置。
