# 更新日志

本文档记录 SMA 数据采集系统的所有重要更新和变更。


## [v1.3.5] - 2026-04-28
### 新增功能
- ✨ **日志系统配置化升级**（`main.py`、`core/config_models.py`、`core/config_loader.py`）
  - 新增 `logging` 配置段，支持以下字段：
    - `output_dir`：日志输出目录（可相对/绝对路径）
    - `backup_days`：日志保留天数
    - `rotation_when`：轮转周期（`S/M/H/D/midnight/W0-W6`）
    - `rotation_interval`：轮转间隔倍数
    - `console_enabled`：是否输出到控制台
  - 主程序启动后在加载配置完成时自动重建日志处理器，使配置目录和轮转参数立即生效。

### 修复与优化
- 🔧 **日志文件轮转与可运维性增强**（`main.py`）
  - 使用 `TimedRotatingFileHandler` 进行文件轮转，避免 `data_collector.log` 长期增长。
  - 日志格式补充 `pid` 与线程名，便于并发排障。
  - 输出目录优先级：`logging.output_dir` > 环境变量 `SD_SMA_LOG_DIR` > `main.py` 同级 `logs` 目录。
  - 对轮转配置增加容错：非法值回退到默认配置（`midnight` / `1` / `14` / 控制台开启）。

### 稳定性改进
- 🛠️ **异常日志统一补充堆栈信息**（多个模块）
  - 在 `main.py`、`communication/*`、`database/*` 的关键异常分支统一使用 `exc_info=True`，提升根因定位效率。

### 日志降噪
- 🔉 **高频日志级别收敛**（`communication/opcua_data_writer.py`、`communication/opcua_client.py`）
  - 批次内逐缓冲区写入成功日志由 `info` 下调为 `debug`，保留批次汇总日志。
  - 健康检查中的高频“未连接尝试重连”日志由 `info` 下调为 `debug`。

### 配置文件
- 📄 新增示例：`config/time_and_variable_logging_config.json`（基于 `time_and_variable_config.json`，包含完整日志参数示例）。
- 📄 更新示例：`config/sample_config.json`、`config/time_and_variable_config.json`、`config/trend_config.json`、`config/pallel_test_config.json` 增加 `logging.output_dir` 示例字段。

### 日志参数说明（`logging`）
- `output_dir`
  - 日志输出目录；支持相对路径与绝对路径。
  - 相对路径按 `main.py` 所在目录解析；未配置时默认使用 `main.py` 同级 `logs` 目录。
  - 目录优先级：`logging.output_dir` > 环境变量 `SD_SMA_LOG_DIR` > 默认 `logs`。

- `backup_days`
  - 对应 `TimedRotatingFileHandler.backupCount`，表示最多保留的历史轮转文件数量。
  - 默认值：`14`；非法值或小于 `1` 时回退到默认值。

- `rotation_when`
  - 对应轮转单位，支持：`S`（秒）、`M`（分钟）、`H`（小时）、`D`（天）、`midnight`（每日零点）、`W0`~`W6`（每周一到周日）。
  - 默认值：`midnight`；非法值回退到默认值。

- `rotation_interval`
  - 轮转间隔倍数；实际轮转周期 = `rotation_when` × `rotation_interval`。
  - 默认值：`1`；非法值或小于 `1` 时回退到默认值。
  - 示例：`rotation_when=H, rotation_interval=6` 表示每 6 小时轮转一次。

- `console_enabled`
  - 是否输出到控制台（stdout）。
  - 默认值：`true`。`false` 时仅文件输出，适合后台服务场景。

---

## [v1.3.4] - 2026-04-23
### 修复与优化
- ⏱️ **纯时间触发（`trigger: time`）节拍**（`communication/data_collector.py` → `_time_triggered_collection`）
  - 使用 **`time.monotonic()`** 维护 **`next_deadline`**：每轮开始前若早于计划时刻则 **`sleep`** 至该时刻，减轻「读点 + 回调耗时叠在 `interval_seconds` 后面」导致的周期漂移。
  - 本轮结束后 **`next_deadline += interval_seconds`**；若实际结束时间**已晚于**该计划点（读点或回调超时），**不再追欠拍**，将下一拍重置为 **`当前单调时刻 + interval_seconds`**（超时后重置相位）。
  - 异常路径在 **`sleep(5)`** 重试等待后，将 **`next_deadline`** 设为 **`monotonic() + interval_seconds`**，避免长期追赶旧计划点。
  - 无效数据跳过回调时仍计为一轮节拍，与原先「失败也等待一轮」的语义一致，但等待方式改为对齐 **`next_deadline`**。

### 技术改进
- 🔧 **OPC UA 按组批量读**（`communication/opcua_client.py` → `read_data_points`）
  - 优先使用 **`Client.get_values(nodes)`** 对当前传入的 **`data_points` 列表一次往返**读取（与配置中**同一 `group` 的一次采集**一致），缩短多变量顺序 `get_value` 的间隔与总耗时。
  - 批量失败（含连接类错误：重连后再次批量仍失败）或返回值个数与请求不一致时，**回退**为原有 **`_read_data_points_sequential`** 逐点读取，保留逐点重连与单点错误记录行为。
  - 返回结构不变：各点仍带 **`value` / `timestamp` / `path`**；整批仍共用进入本方法时的一次 **`datetime.now()`** 作为 **`timestamp`**（与改前整批单一时标一致）。

---

## [v1.3.3] - 2026-04-22
### 新增功能
- ✨ **`time_and_variable` 触发模式**（定时插入 + 变量上升沿立即插入）
  - 在 `groups[].trigger` 中取值 **`"time_and_variable"`**。
  - **`interval_seconds`**：与纯时间触发相同，按周期采集并入库；首次进入循环即执行一次定时采集。
  - **`trigger_interval_seconds`**（必填）：对 **`trigger_point`** 的轮询周期（秒），用于检测布尔上升沿（`false` → `true`）；沿触发时立即读取本组 `data_points` 并入库。
  - 回调中 **`trigger_type`**：定时为 **`"time"`**，变量沿触发为 **`"variable"`**（与现有存储/日志语义一致）。
  - **`reset_trigger_after_read`**：沿触发采集后是否将触发点写回 `false`，行为与 `trigger: variable` 单点模式一致。
  - **约束**：此模式下 **`is_parallel` 必须为 `false`**（不支持并行数组触发）；加载配置时若不满足或缺少 `trigger_point` / `trigger_interval_seconds`（≤0 或非数值）将报错。

### 配置与模型
- 📝 **`core/config_models.py`**：`TriggerType` 增加 `TIME_AND_VARIABLE`；`DataGroup` 增加可选字段 **`trigger_interval_seconds`**。
- 📝 **`core/config_loader.py`**：解析并校验上述字段与并行约束。
- 📝 **`communication/data_collector.py`**：实现 **`_time_and_variable_collection`**，在单次循环内用 `min(trigger_interval_seconds, 距下次定时采集剩余时间)` 睡眠，兼顾定时与触发采样。
- 📄 示例配置：**`config/time_and_variable_config.json`**。

---

## [v1.3.2] - 2026-04-14
### 修复与优化
- 🐛 **并行触发入库修复**（`is_parallel` / 布尔数组触发 + 数组测点）
  - 单次触发若对应多个索引，原先各点 `value` 为 Python 列表，单行 `INSERT` 会导致 MySQL 报错 `1241 Operand should contain 1 column(s)`。
  - 在 `communication/data_collector.py` 中于回调前将等长列表**按索引拆成 n 条**采集记录，每条内各点为**标量**；拆分行携带 `trigger_index`，`is_parallel` 置为 `false`，避免重复拆分。
  - 若各点列表长度不一致或结构异常，记录警告并**回退为整包单次回调**（与旧行为一致）。

### 技术改进
- 🔧 **批量入库唤醒**（`database/data_storage.py`）
  - 当某组队列中条数达到该组配置的 `batch_insert_size` 时，通过 `asyncio.Event` **立即唤醒**处理循环，避免在「未满一批」分支固定 `sleep(1)` 或空队列 `sleep(0.1)` 时，短时间连续 `add_data`（例如并行一次拆出 n 条）仍长时间等待。
  - 原有「该组累计条数 ≥ batch 则整组可处理」逻辑不变；单次涌入条数大于 `batch_insert_size` 时仍会尽快执行插入。

### 其他
- 🔧 移除 `data_collector.py` 中误引入的 `telnetlib` 无用导入。

---

## [v1.3.1] - 2026-04-14
### 新增功能说明：并行触发（Parallel）采集与写入
面向 **多工位 / 多通道共用同一套 OPC UA 数组节点** 的场景：触发信号为**布尔数组**，各测点为**与触发数组下标对齐的数值数组**。程序在**同一扫描周期**内可检测到多个上升沿（多个索引同时由 `false→true`），并对每个索引各写入**一行**数据库记录（每行内各数据点为标量）。

#### 与常规变量触发的区别
| 项目 | `trigger: variable`（默认） | `is_parallel: true` |
|------|---------------------------|----------------------|
| `trigger_point` 对应 OPC UA 节点 | 单个布尔 | **布尔数组** |
| `data_points` 对应节点 | 标量 | **数组（与触发数组等长）** |
| 一次触发 | 整组读一次、一行入库 | 按上升沿索引拆成 **n 行** 入库 |

#### 配置项（`groups` 中单组）
- **`trigger`**：须为 `"variable"`（与时间触发、查询触发并列；并行模式在此基础上扩展）。
- **`is_parallel`**：`true` 时启用并行触发采集；`false` 或未写则与普通变量触发一致。
- **`trigger_point`**：数据点名称，指向 OPC UA 上的**布尔数组**；程序对数组逐元素做**上升沿检测**（上一周期为假、本周期为真）。
- **`data_points`**：各测点仍写在 `points` 里；其 OPC UA 节点须为**数组**，且长度不少于触发数组，以便按触发索引取 `array[i]`。
- **`reset_trigger_after_read`**：为 `true` 时，在本周期处理完后对**已触发的下标**写回 `false`（整数组写回，仅将触发位清零）；与单点触发的“读后复位”语义一致，只是变为数组写。
- **`interval_seconds`**：轮询触发数组与采样的周期（秒），可与普通变量触发组相同方式配置。
- **`batch_insert_size`**：入库批量阈值。并行一次可能产生多行（例如 10 行），会连续进入存储队列；达到该组阈值后会尽快批量写入（详见 v1.3.2 的存储唤醒说明）。

#### PLC / OPC UA 侧约定
- 触发数组与各数据数组**下标一一对应**；同一索引上的上升沿与 `F1[i]…F5[i]` 表示同一工位/通道快照。
- 若某索引未触发，该位应保持 `false`，避免误沿。

#### 使用方法
1. 在 `points` 中为触发与各数组测点配置 **NodeId**（与 Automation Studio / UA 映射一致）。
2. 在目标 `groups` 中设置 `"trigger": "variable"`、`"is_parallel": true`，并指定 `trigger_point` 与 `data_points`。
3. 将本组加入对应 `connections[].data_groups` 与 `database.data_groups`（若需落库）。
4. 参考示例配置：`_Prj/SD_SMA_DATA_COLLECTOR/config/pallel_test_config.json`（文件名中的拼写为历史命名，不影响功能）。

#### 运行时行为摘要
- 回调与入库侧收到的是**按索引拆开的多条记录**；每条可带内部字段 `trigger_index`（触发下标），便于追溯。
- 若各数据点列表长度不一致或结构异常，会记录警告并回退为**不拆分**的整包回调（与兼容路径一致）。

---

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
