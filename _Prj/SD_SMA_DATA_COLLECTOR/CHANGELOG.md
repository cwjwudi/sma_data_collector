# 更新日志

本文档记录 SMA 数据采集系统的所有重要更新和变更。


## [v1.3.0] - 2026-04-08
### 新增功能
- ✨ **附加查询条件（aux_query）功能**
  - 在 `query_config` 中支持 `aux_query_field` 字段配置
  - 支持从 OPC UA 读取附加查询条件字符串
  - 将附加条件拼接到 SQL WHERE 子句中
  - 格式：`SELECT ... WHERE (time BETWEEN start AND end) AND (aux_query)`
  - 支持灵活的自定义 SQL 条件（如 `code > 100`、`msg LIKE '%error%'`）

### 配置文件变更
- 📝 **DataGroup 数据模型扩展**
  - 在 `query_config` 中新增 `aux_query_field` 字段
  - 用于指定读取附加查询条件的 OPC UA 数据点名称

### 使用示例
```json
{
  "query_config": {
    "aux_query_field": "strAuxQuery1",
    "start_time_field": "strStartTimes1",
    "end_time_field": "strEndTimes1",
    "by_what_time": "ts"
  }
}
```

### 技术改进
- 🔧 **数据采集器更新** (`communication/data_collector.py`)
  - `_read_query_parameters()` 方法读取 `aux_query_field` 配置
  - 查询任务字典新增 `aux_queries` 字段传递附加条件

- 🔧 **查询处理器增强** (`database/data_query.py`)
  - `query_data()` 方法新增 `aux_queries` 参数
  - `_query_table_data()` 方法新增 `aux_query` 参数
  - SQL 构建时将附加条件添加到 WHERE 子句
  - **key 包含 aux_query**：确保不同的附加查询条件分开处理

- 🔧 **主程序集成** (`main.py`)
  - `query_processor.query_data()` 调用传递 `aux_queries` 参数

### 查询示例
当 `strAuxQuery1` = `"code > 100"` 时，生成的 SQL：
```sql
SELECT `ts`, `code`, `msg` FROM `alarm_group_1_20260408` 
WHERE (`ts` BETWEEN '2026-04-01' AND '2026-04-08') AND (code > 100) 
ORDER BY `ts`
```

---

## [v1.2.1] - 2026-04-08
### 优化功能
- 🔧 **分表查询逻辑优化** (`database/data_query.py`)
  - 重构 `_get_matching_tables()` 方法的匹配逻辑
  - **表数据范围定义**: `[表创建日期, 下一张表的创建日期)`
    - 表名日期不再代表数据日期，而是表格创建日期
    - 每张表包含从创建日期开始的数据，直到下一张表创建为止
  - **新的匹配条件**: 查询时间范围与表的数据时间范围有交集
    - 交集判断公式: `start_time < table_end AND end_time > table_date`
    - 最后一张表的数据范围延伸至无穷大（`datetime.max`）
  - 移除原有的日期枚举生成逻辑，改用交集判断算法

### 匹配规则示例
| 查询时间范围 | 匹配的表 |
|-------------|----------|
| 2026-03-19 ~ 2026-04-17 | 20260314, 20260414, 20260416 |
| 2026-04-19 ~ 2026-04-22 | 20260416, 20260420 |
| 2026-04-22 ~ 2026-04-25 | 20260420 |
| 2026-03-12 ~ 2026-04-14 | 20260314 |
| 2026-03-12 ~ 2026-03-13 | 无 |

---

## [v1.2.0] - 2026-04-08
### 新增功能
- ✨ **数据类型（datatype）功能**
  - 在配置文件中支持为数据点指定 `datatype` 属性
  - 支持类型：datetime、int、float、str、bool
  - **影响数据库表结构**：datatype 会决定数据库列的类型
    - `datetime` → `DATETIME` 类型
    - `int` → `INTEGER` 类型
    - `float` → `DOUBLE` 类型
    - `str` → `VARCHAR(255)` 类型
  - **数据转换**：写入数据库前自动进行类型转换
    - datetime 类型支持多种格式解析（7 种常见格式）
    - 包含 `DT#2022-03-19-17:41:48` 格式支持
  - **向后兼容**：datatype 是可选属性，不影响现有配置
  
- ✨ **查询时间字段动态配置（by_what_time）**
  - 在 `query_config` 中新增 `by_what_time` 字段
  - 支持自定义查询时使用的时间字段（默认使用 `collection_time`）
  - 适用于使用数据点中的时间字段（如 `ts`）进行查询的场景
  - 影响所有查询相关操作：
    - SQL WHERE 条件
    - SELECT 字段列表
    - ORDER BY 排序
    - CSV 导出时间列名
  - 详细的日志记录，包含使用的时间字段信息

### 配置文件变更
- 📝 **DataPoint 数据模型扩展**
  - 新增 `datatype` 可选字段
  - 支持指定数据类型：datetime、int、float、str、bool
  
- 📝 **DataGroup 数据模型扩展**
  - 在 `query_config` 中新增 `by_what_time` 字段
  - 用于指定查询时使用的时间字段名

### 使用示例
```json
{
  "points": [
    {
      "name": "ts",
      "path": "ns=6;s=::AlarmQuerr:ts",
      "description": "报警时间戳",
      "datatype": "datetime"
    }
  ],
  "query_config": {
    "by_what_time": "ts",
    "buffer_nodes": [...],
    "time_nodes": [...]
  }
}
```

### 技术改进
- 🔧 **类型推断优化** (`database/data_storage.py`)
  - `_infer_column_types()` 方法优先使用配置的 datatype
  - 简化列类型推断逻辑
  
- 🔧 **查询处理器增强** (`database/data_query.py`)
  - `query_data()` 方法支持 by_what_time 参数
  - `_query_table_data()` 方法使用动态时间字段
  - `_export_to_csv()` 方法支持自定义时间列名

- 🔧 **数据采集器更新** (`communication/data_collector.py`)
  - `_read_query_parameters()` 方法读取 by_what_time 配置
  - query_task 字典包含 by_what_time 参数

- 🔧 **主程序集成** (`main.py`)
  - `query_processor.query_data()` 调用传递 by_what_time 参数

---

## [v1.1.5] - 2026-04-02
### 新增功能
- ✨ **bNext 信号控制功能**
  - 使用单一布尔变量 `bNext` 控制批次传输
  - 支持上升沿检测：每次 PLC 触发 bNext 从 FALSE 到 TRUE 的跳变，发送下一批数据
  - 替代原有的复杂握手协议，简化 PLC 程序逻辑
  - 在 `query_config` 中新增 `cmd_next_nodes` 字段配置

- ✨ **递减式剩余量反馈机制**
  - 反馈值计算公式：`反馈量 = 剩余量 + 已发送量`
  - PLC 可实时查看还有多少数据待接收
  - 每批传输完成后自动更新反馈值（递减）
  - 传输完成时反馈值为 0

- ✨ **分批传输机制**
  - 当数据库查询结果超过缓冲区上限（10,000 条）时自动分批
  - 每批写入完成后等待 PLC 的 bNext 上升沿信号
  - 支持 30 秒超时保护，防止死锁
  - 详细的传输日志记录

### 配置文件变更
- 📝 **DataGroup 数据模型扩展**
  - 新增 `cmd_next_nodes` 字段配置下一批请求信号节点
  - 新增 `buffer_size` 字段配置每个缓冲区的最大容量（默认 10000）
  - 新增 `feed_back_nodes` 字段配置反馈节点数组

### 使用示例
```json
{
  "query_config": {
    "buffer_size": 10000,
    "cmd_next_nodes": [
      "ns=6;s=::DataRev:stDbReadQuery.stCmd.bNext"
    ],
    "feed_back_nodes": [
      "ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevFeedBack"
    ]
  }
}
```

### 技术改进
- 🔧 **OPC UA 数据写入器增强** (`communication/opcua_data_writer.py`)
  - 新增 `_write_query_results_batched()` 方法实现分批传输
  - 新增 `_write_batch_to_buffers()` 方法写入单批数据
  - 新增 `_wait_for_plc_next_signal()` 方法检测 bNext 上升沿
  - 重构查询结果写入逻辑，优先使用分批传输

- 🔧 **查询处理器增强** (`database/data_query.py`)
  - 优化查询结果返回格式，支持批量数据处理

### 工作流程示例
#### 完整传输流程（25,000 条数据）

| 批次 | 本批发送量 | 累计已发送 | 反馈值 | PLC 动作 |
|------|-----------|-----------|--------|----------|
| 第 1 批 | 10,000 | 10,000 | **25,000** | 读取后触发 bNext↑ |
| 第 2 批 | 10,000 | 20,000 | **15,000** | 读取后触发 bNext↑ |
| 第 3 批 | 5,000 | 25,000 | **5000** | 传输完成 |

#### 时序图
```
Python 端                              PLC 端
  │                                     │
  ├─ 查询数据库（25,000 条）              │
  │                                     │
  ├─ 写入第 1 批（10,000 条）            │
  ├─ 反馈：25,000（剩余量）──────────────>│读取缓冲区
  │                                     │
  │                              <──────┤设置 bNext = TRUE
  ├─ 检测 bNext↑上升沿                   │
  │                                     │
  ├─ 写入第 2 批（10,000 条）             │
  ├─ 反馈：15,000（剩余量）───────────────>│读取缓冲区
  │                                     │
  │                              <──────┤设置 bNext = TRUE
  ├─ 检测 bNext↑上升沿                   │
  │                                     │
  ├─ 写入第 3 批（5,000 条）             │
  ├─ 反馈：5000（传输完成）──────────────>│读取缓冲区
  │                                     │
  └─ 传输完成                            └─复位 bNext = FALSE
```

### 性能优化
| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 信号数量 | 10 个握手信号 | **1 个 bNext 信号** |
| 每次轮询次数 | 10 次 OPC UA 读取 | **1 次 OPC UA 读取** |
| 响应时间 | ~50-100ms | **~5-10ms** |

### PLC 程序配合要求
PLC 程序需要在读取完每批数据后将 bNext 从 FALSE 置为 TRUE，Python 端检测到上升沿后继续发送下一批数据。

---

## [v1.1.1] - 2026-04-02

### 新增功能
- ✨ **缓冲区数据量反馈功能**
  - 在 `query_config` 中新增 `feed_back_nodes` 字段配置反馈节点数组
  - 每个缓冲区对应一个反馈节点，用于记录实际写入的数据量
  - 自动将每个缓冲区的实际采集数据条数写入对应的 OPC UA 反馈节点
  - 反馈值类型：UInt32（无符号 32 位整数）
  - 支持 10 个反馈节点，与 buffer_nodes 和 time_nodes 保持一一对应
  - 如果某缓冲区无数据，则向对应反馈节点写入 0
  - 详细的日志记录，包括每个反馈节点的写入状态和数据量

### 配置文件变更
- 📝 **DataGroup 数据模型扩展**
  - 在 `DataGroup.query_config` 中支持 `feed_back_nodes` 字段
  - 用于配置缓冲区数据量反馈的 OPC UA 节点地址数组
  
### 使用示例
```json
{
  "query_config": {
    "feed_back_point": "ns=6;s=::DataRev:uiQueryFeedBack",
    "buffer_nodes": [
      "ns=6;s=::DataRev:stDbReadQuery.stRev[0].rRevBuffer",
      "... 更多缓冲区节点"
    ],
    "time_nodes": [
      "ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevTime",
      "... 更多时间节点"
    ],
    "feed_back_nodes": [
      "ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevFeedBack",
      "ns=6;s=::DataRev:stDbReadQuery.stRev[1].udiRevFeedBack",
      "... 共 10 个反馈节点"
    ],
    "buffer_size": 10000
  }
}
```

---

## [v1.1.0] - 2026-03-26

### 新增功能
- ✨ **心跳信号功能**
  - 新增 `HeartbeatManager` 类，用于管理 OPC UA 心跳信号
  - 支持在 `connections` 配置中添加 `heartbeat` 字段指定心跳地址
  - 每隔 1 秒自动向指定 OPC UA 地址写入值 1（UInt16 类型）
  - 支持多个连接配置各自的心跳信号
  - 自动检测 OPC UA 连接状态，未连接时跳过写入
  - 详细的日志记录和错误处理
  
- ✨ **查询状态反馈功能**
  - 新增查询状态实时反馈机制，向 PLC 返回数据库查询状态
  - 定义 5 种标准状态码：
    - `0`: 空闲/无查询
    - `1`: 正在查询
    - `2`: 查询成功
    - `3`: 无查询数据返回
    - `4`: 其他错误
  - 在 `query_config` 中新增 `feed_back_point` 字段配置反馈点地址
  - 状态值通过 OPC UA 写入（UInt16 类型），PLC 可实时读取
  - 完整的错误处理：查询失败、异常时自动反馈错误状态
  - 封装 `_write_query_status()` 方法，提高代码复用性

### 配置文件变更
- 📝 **Connection 数据模型扩展**
  - 在 `Connection` 类中添加 `heartbeat` 可选字段
  - 用于配置心跳信号的 OPC UA 地址
  
- 📝 **DataGroup 数据模型扩展**
  - 在 `DataGroup.query_config` 中支持 `feed_back_point` 字段
  - 用于配置查询状态反馈的 OPC UA 节点地址
  
### 使用示例
```json
{
  "connections": [
    {
      "name": "connection1",
      "communication": "PLC1",
      "data_groups": ["sensor_group_1", "sensor_group_2", "trigger_group_1","query_group_1"],
      "heartbeat": "ns=6;s=::DataRev:bHeartBeat"
    }
  ]
}
```

### 技术改进
- 🔧 新增 `communication/heartbeat_manager.py` 模块
- 🔧 更新 `core/config_models.py` 中的 `Connection` 类和 `DataGroup` 类
- 🔧 更新 `communication/opcua_data_writer.py` 添加状态码常量和 `_write_feed_back_status()` 方法
- 🔧 更新 `main.py` 集成心跳管理器和查询状态反馈
- 🔧 新增 `_write_query_status()` 方法封装状态写入逻辑
- 🔧 更新 `sample_config.json` 添加心跳配置和查询反馈配置示例

---

## [v1.0.0] - 初始版本
- 多控制器支持
- 灵活配置系统
- 多种触发模式（时间/变量/查询）
- 双数据库支持（MySQL/SQLite）
- HTTP 数据推送功能
- 查询回写功能
