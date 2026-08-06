# SMA 数据采集系统

一个工业数据采集系统，支持多 OPC UA 控制器连接，具备 MySQL/SQLite 数据库存储与 Web 配置运维能力。

## 功能说明

### 1. 定时采集

定时采集模式按照预设的时间间隔自动从 OPC UA 服务器读取数据并存储到数据库。

**主要特性：**
- ✅ **时间间隔触发**: 按照配置的间隔自动采集数据
- ✅ **单调时钟节拍控制**: 使用 `time.monotonic()` 对齐采样节拍，降低循环执行耗时导致的周期漂移
- ✅ **超时不追欠拍**: 当单轮处理超时，下一拍自动重置为“当前时刻 + interval”，避免连续追赶历史节拍
- ✅ **多数据点支持**: 每个数据组支持多个数据点同时采集
- ✅ **灵活配置**: 可为不同数据组设置不同的采集间隔
- ✅ **按组外部启停**: 每组可选配 OPC UA `enable_point`；`1/True` 启用、`0/False` 停用，未配置时始终启用
- ✅ **批量存储**: 支持批量数据插入，提高数据库写入效率
- ✅ **年份分表**: 支持按批次主表开批年份分表；无批次主表的旧配置仍兼容当前年份分表
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

### 3. 批次主表与年份分表

面向按生产批次归档的场景，系统支持使用一张 `batch_upsert` 批次主表统一决定其他明细表的年份归属。

**主要特性：**
- ✅ **单一批次主表**: 同一配置中最多启用一张 `batch_upsert.enabled=true` 的批次主表
- ✅ **主表固定表名**: 批次主表不加年份后缀，长期维护同一张批次索引表
- ✅ **明细按开批年份归表**: 所有非主表数据组按批次主表的开批时间年份写入目标表
- ✅ **未结批不跨表**: 即使自然时间跨年，未结批批次仍写入开批年份表
- ✅ **结批强制写入**: 结批成功后立即写入队列中的所有明细数据，不等待 `batch_insert_size`
- ✅ **分表间隔年份**: `partition_interval_years=2` 时，2025/2026 归入 `_y2025_span2`，2027/2028 归入 `_y2027_span2`
- ✅ **启动恢复未结批**: 程序启动时会从批次主表恢复 `end_time IS NULL` 的未结批上下文

**典型应用场景：**
- 批次生产数据归档
- 跨年生产批次追溯
- 明细数据与批次主记录统一查询

### 4. Web 配置界面（web_config）

`web_config` 是当前推荐的运行入口，负责“配置管理 + 采集托管 + 运行监视”。

**主要特性：**
- ✅ **统一入口**: 在浏览器内完成配置编辑、校验、导出与采集控制
- ✅ **采集托管**: 通过 Web 页面启动/停止采集，避免命令行误操作
- ✅ **运行监视**: 展示数据库连通、OPC UA 连接状态、主循环状态与最近日志
- ✅ **日志增量拉取**: 监视面板按游标获取日志，降低重复拉取与长时间运行时的卡顿
- ✅ **日志暂停/继续**: 支持暂停实时日志滚动，恢复后自动补齐暂停期间增量
- ✅ **配置可视化**: 支持读取/直写 `config/` 下 JSON 与 OPC UA 浏览加点位
- ✅ **校验增强**: 点位 `name/path` 唯一性校验前置到页面交互与保存阶段

**设计边界：**
- 当前版本已删除历史查询回写链路；配置中不再支持 `trigger=query`、`groups[].query_config`、`groups[].output_mode` 与 `http_server`。

### 5. v1.3.0+ 版本增强（重点）

- **Unreleased - 批次主表年份分表**
  - 新增 `partition_interval_years`，配置页显示为“分表间隔年份”，旧字段 `recreate_interval_days` 保留但不再参与分表逻辑。
  - 一个配置中只能启用一张 `batch_upsert` 批次主表；主表固定表名，其他表按主表开批时间年份归表。
  - 结批成功时会强制写入所有明细组队列数据，避免明细数据因未达到 `batch_insert_size` 长时间滞留。
  - 启动时会恢复未结批批次上下文，并提前确保目标年份明细表存在。
  - 已完成真实 OPC UA + MySQL 测试，报告见 `docs/AI_BATCH_PARTITION_LIVE_TEST_REPORT_20260708.md`。

- **v1.5.1 - 近期增强（相对 31b2355）**
  - `heartbeat` 支持填写 `points` 中的点位名称，运行时自动解析为 OPC UA 地址（仍兼容旧 `ns=...` 直填方式）。
  - `trigger=variable` 轮询支持 `trigger_interval_seconds`，未配置时自动回退 `interval_seconds`。
  - 配置管理器新增 `points.name/path` 重复校验；OPC UA 浏览“加入 points”后相关下拉框即时刷新。
  - 仪表盘日志接口升级为 `cursor/limit` 增量协议，并新增“暂停日志”能力。
  - 数据库历史表日期初始化兼容 SQLAlchemy 2.x `Row` 返回结构，降低首次扫描失败风险。

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
- Python 3.10+
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
- 作为 v1.5.1 推荐用法，日常配置变更与运行管理优先通过 `web_config` 完成。
- 同一进程内请勿再运行 `python main.py` 连接同一数据库做采集，避免重复占库。
- 其余：读取/编辑/校验配置、导出与直写 `config/`、OPC UA 浏览加点位等。
- 旧版查询回写配置已删除，加载含 `trigger=query` / `query_config` / `http_server` 的配置会报错。

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
│   ├── data_collector.py  # 数据采集器（时间/变量/时间+变量触发）
│   ├── opcua_feedback_writer.py # OPC UA 插入反馈写入器
│   ├── heartbeat_manager.py # 心跳管理器（定时写入心跳信号）
│   └── date_and_time.py   # 日期时间工具函数
├── web_config/         # Web 配置与采集托管模块（推荐入口）
│   ├── main.py            # FastAPI 应用入口
│   ├── static/            # 前端页面与静态资源
│   └── ...                # Web API 与配置服务实现
├── database/           # 数据库模块
│   ├── db_manager.py      # 数据库管理器（连接/断开/建表）
│   └── data_storage.py    # 数据存储处理器（批量插入）
├── tests/              # 测试用例
│   ├── test_core.py              # 核心配置测试
│   ├── test_multi_communication.py # 多通信连接测试
│   ├── test_opc_write.py         # OPC UA 写入测试
│   └── test_mysql.py             # MySQL 数据库测试
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
- `enable_point`: （可选）外部启停点位名称，引用 `points[].name`；值为 `1/True` 时启用本组，`0/False` 时停用，未配置时本组始终启用
- `interval_seconds`: 静态采样/检查间隔（秒），同时作为动态间隔点首次读取失败时的回退值
- `interval_point`: （可选）动态采集间隔点位名称，引用 `points[].name`；点位值单位为秒，仅支持 `time` / `time_and_variable`
- `trigger`: 触发方式
  - `time`: 时间间隔触发
  - `variable`: 变量触发（由 PLC 信号触发）
  - `time_and_variable`: 定时采集 + 变量上升沿立即采集
- `data_points`: 包含的数据点名称列表
- `variable_point_overrides`: （可选）仅用于 `time_and_variable`；按“`data_points` 逻辑字段名 -> PLC 快照点名”配置 variable 触发时的替代读取源。数据库列名仍保持逻辑字段名，time 采集仍读取原始点位。
- `trigger_point`: 触发变量名称（`variable` / `time_and_variable` 需要）
- `trigger_mode`: 触发点检测方式。`poll`（默认）按间隔轮询；`subscription` 使用 OPC UA 数据变化订阅
- `trigger_interval_seconds`: `poll` 模式的触发点轮询间隔；Web 配置页提供 1–10 秒下拉选项，加载器仍兼容历史配置中的任意正数
- `reset_trigger_after_read`: 读取后是否复位触发信号
- `is_parallel`: 是否启用并行触发模式（仅 `trigger: variable` 可用）
- `partition_interval_years`: 数据库分表间隔年份，默认 `1`
- `recreate_interval_days`: 旧版兼容字段，保留读取与写回，但不再参与分表逻辑
- `batch_insert_size`: 批量插入大小
- `unique_key_point`: （可选）组内唯一性校验键（必须在 `data_points` 中）
- `insert_feedback`: （可选）插入反馈配置（UDINT）
  - `feedback_point`: 插入结果反馈点名称（需先在 `points` 中定义，再在此引用）
  - `code_success`: 全部成功时回写码（默认 `0`）
  - `code_unique_conflict`: 唯一性冲突时回写码（默认 `1`）
  - `code_db_error`: 数据库错误时回写码（默认 `2`）
  - `code_other_error`: 其他失败时回写码（默认 `3`）
- `indexes`: （可选）索引配置列表；`columns` 可选择当前数据组的配置点位，以及固定时间字段 `collection_time`、`created_at`，并支持组合成复合索引
- `batch_upsert`: （可选）批次主表配置，用于按唯一批次号开批/结批
  - `enabled`: 是否启用为批次主表；同一配置中最多只能有一组为 `true`
  - `start_time_point`: 开批时间点位名称，必须在该组 `data_points` 中
  - `end_time_point`: 结批时间点位名称，必须在该组 `data_points` 中
  - `update_only_when_end_time_is_null`: 当前仅支持 `true`
  - `reject_when_end_time_exists`: 当前仅支持 `true`
  - `allow_idempotent_same_end_time`: 是否允许相同结批时间的幂等重放

**触发配置约束：**
- 配置 `enable_point` 后，采集器每秒读取一次该点；停用时取消本组采集任务，重新启用时自动恢复。读点失败或值不是 `0/1` 时保持上一有效状态；启动后尚无有效状态时保持停用。
- `interval_point` 返回值必须是大于 `0` 的有限数值；无效值或临时读点失败时继续使用上次有效值，尚无有效值时使用 `interval_seconds`。
- 动态间隔变化从采集器检测到新值时重新起算下一周期，不补采旧节拍；`time_and_variable` 的外部触发检测不受影响。
- `variable` / `time_and_variable` 均支持 `trigger_mode: subscription`。订阅模式由服务器数据变化事件驱动，不再周期读触发点；连接恢复后会自动重建订阅并推送当前值。
- `poll` 模式要求有效的正数 `trigger_interval_seconds`；`variable` 未配置时兼容回退到 `interval_seconds`。
- `time_and_variable` 模式下必须配置 `trigger_point`，且 `is_parallel` 必须为 `false`。
- `variable_point_overrides` 的键必须存在于本组 `data_points`，值必须引用已定义的 `points[].name`；两侧都声明 `datatype` 时必须一致。PLC 应先写完整快照再置位 Trigger，且 Trigger 未复位前不得覆盖快照。
- 并行触发模式（`trigger: variable` + `is_parallel: true`）下，`trigger_point` 应为布尔数组节点，`data_points` 应为与触发数组同下标语义的数组节点。
- 配置了 `unique_key_point` 时，系统会在插入前按该列做表内判重，重复数据不落库并返回唯一性冲突码。
- 启用 `batch_upsert` 的组必须配置 `unique_key_point`，并配置有效的开批/结批时间点位。
- 启用批次主表后，所有非主表数据组必须包含批次主表的批次号点位，否则配置加载会失败。
- 批次主表固定表名；所有非主表按批次主表的开批年份与 `partition_interval_years` 计算目标表名。
- 批次主表结批成功后，系统会立即写入其他数据组队列中的数据，不再等待这些组达到 `batch_insert_size`。

### 通信配置 (communications)
- `name`: 通信连接名称（唯一标识）
- `type`: 通信类型（目前仅支持 "opcua"）
- `host`: OPC UA 服务器地址
- `port`: OPC UA 服务器端口
- OPC UA 通信使用原生异步 `asyncua`；状态机为 `disconnected → connecting/reconnecting → connected`，同一连接只允许一个重连任务，重连成功后自动恢复全部订阅。

### 连接配置 (connections)
- `name`: 连接配置名称（唯一标识）
- `communication`: 引用的通信名称
- `data_groups`: 使用该通信的数据组名称列表
- `heartbeat`: （可选）心跳信号点位，优先填写 `points[].name`
  - 推荐写法：引用 `points` 中已定义的点位名称（如 `uiHeartBeat`），系统会自动解析成对应 OPC UA 地址
  - 兼容写法：仍支持直接填写 OPC UA 地址（`ns=X;s=节点路径`）
  - 如果配置了该字段，系统会每隔 1 秒向该地址写入值 1（UInt16 类型）
  - 用于保持 PLC 连接活跃，防止超时断开
  - 示例：`"heartbeat": "uiHeartBeat"`

### 数据库配置 (database)
- `auto_create`: MySQL 目标数据库不存在时是否自动创建，默认 `false`。启用账号必须具备服务器级 `CREATE` 权限，推荐使用 ROOT 完成首次初始化。

启用后仅在 MySQL 返回 `1049 Unknown database` 时执行 `CREATE DATABASE IF NOT EXISTS`，随后重新连接并沿用现有的自动建表、建索引和补列流程；密码错误、网络错误等不会触发建库。
- `type`: 数据库类型（mysql/sqlite）
- `name`: 数据库名称
- `host/port/username`: 连接参数（MySQL 需要）
- 数据库密码由 Web 配置页输入后加密为 `password_enc`；页面和 API 不回显明文或密文。也可用环境变量 `SD_SMA_DB_PASSWORD` 注入，环境变量优先级最高。
- 加密密钥保存在配置目录的 `.sd_sma_collector_fernet.key`，迁移配置时必须与 JSON 一并安全迁移；该密钥不得提交到 Git。
- `data_groups`: 要存储的数据组名称列表

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
      "heartbeat": "uiHeartBeat"
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
      "name": "uiHeartBeat",
      "path": "ns=6;s=::DataRev:uiHeartBeat",
      "description": "心跳信号点位"
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
      "partition_interval_years": 1,
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
      "partition_interval_years": 1,
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

### 批次主表与年份分表示例

以下示例展示最小配置片段。实际使用时，批次号、开批时间、结批时间和触发点都需要先在 `points` 中定义。

```json
{
  "groups": [
    {
      "name": "BatchHeader",
      "interval_seconds": 1,
      "trigger": "variable",
      "description": "批次主表",
      "data_points": ["strBatchCode", "dtBatchStartTime", "dtBatchEndTime"],
      "trigger_point": "bBatchTrigger",
      "trigger_interval_seconds": 0.2,
      "reset_trigger_after_read": true,
      "partition_interval_years": 1,
      "batch_insert_size": 1,
      "unique_key_point": "strBatchCode",
      "batch_upsert": {
        "enabled": true,
        "start_time_point": "dtBatchStartTime",
        "end_time_point": "dtBatchEndTime",
        "update_only_when_end_time_is_null": true,
        "reject_when_end_time_exists": true,
        "allow_idempotent_same_end_time": true
      }
    },
    {
      "name": "BatchDetail",
      "interval_seconds": 1,
      "trigger": "variable",
      "description": "批次明细表",
      "data_points": ["strBatchCode", "rEC", "rF10"],
      "trigger_point": "bDetailTrigger",
      "trigger_interval_seconds": 0.2,
      "reset_trigger_after_read": false,
      "partition_interval_years": 1,
      "batch_insert_size": 100
    },
    {
      "name": "BatchDetail_2Year",
      "interval_seconds": 1,
      "trigger": "variable",
      "description": "两年一个年份桶的明细表",
      "data_points": ["strBatchCode", "rAIR", "rAP1"],
      "trigger_point": "bDetailTrigger",
      "trigger_interval_seconds": 0.2,
      "reset_trigger_after_read": false,
      "partition_interval_years": 2,
      "batch_insert_size": 100
    }
  ]
}
```

表名示例：

```text
BatchHeader 固定写入 BatchHeader

partition_interval_years=1:
2025 开批 -> BatchDetail_y2025_span1
2026 开批 -> BatchDetail_y2026_span1

partition_interval_years=2:
2025 开批 -> BatchDetail_2Year_y2025_span2
2026 开批 -> BatchDetail_2Year_y2025_span2
2027 开批 -> BatchDetail_2Year_y2027_span2
```

运行要点：
- `BatchHeader` 中开批成功后，系统会创建或确认当前批次年份对应的所有明细表。
- 批次未结批时，即使自然时间跨年，明细数据仍写入开批年份表。
- 结批成功后，所有明细组队列中的数据会立即写入对应年份表。
- 如果程序重启时主表存在 `end_time IS NULL` 的批次，系统会恢复该批次的开批年份上下文。

### 心跳信号配置

推荐先在 `points` 中定义心跳地址，再在 `connections` 里通过点位名引用：

```json
{
  "points": [
    {
      "name": "uiHeartBeat",
      "path": "ns=6;s=::DataRev:bHeartBeat"
    }
  ],
  "connections": [
    {
      "name": "connection1",
      "communication": "PLC1",
      "data_groups": ["sensor_group_1", "sensor_group_2"],
      "heartbeat": "uiHeartBeat"
    }
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

- 未启用持久化队列时，只有某个触发索引的全部配置数据点均读取成功且该行成功进入内存队列后，程序才复位该索引。
- 启用 `persistent_queue.enabled=true` 后，只有 SQLite outbox 事务提交成功才复位该索引；断电或进程强制终止后会从 outbox 恢复。
- Web 配置页的“数据库”页签可直接启用持久化队列并设置 outbox 路径、同步级别、重试和容量参数。
- 配置了 `groups[].enable_point` 的采集组从启用切换为停用时，会先停止该组采集，再立即刷新该组未满 `batch_insert_size` 的缓存；其他组缓存不受影响，失败记录继续按 outbox/内存重试策略保留。
- 复位会通过 OPC UA 读回确认；若复位后 PLC 已立即再次置位，程序会保留该高电平并在下一轮作为新事件采集。
- 触发复位表示采集器已经可靠接收；启用 outbox 时表示 SQLite 已提交，仍不表示 MySQL 已提交。
- MySQL 瞬时失败记录进入持久化重试状态，不可重试的数据进入持久化 dead-letter；配置、恢复和运维命令见 `docs/PERSISTENT_QUEUE.md`。
- 成功记录按 `completed_retention_days` 保留，并由 `cleanup_interval_seconds` 在运行期间定期清理；启动和正常停机时也会执行一次，避免长期运行时 outbox 持续累积。
- 该模式已使用测试 PLC `192.168.50.233` 完成 61 分钟全组六组压力验证，详见 `docs/PERSISTENT_OUTBOX_1H_STRESS_REPORT_20260713.md`。
- `bTrigger1` 为布尔数组（如 `[false, true, false, ...]`），系统检测每个索引的上升沿。
- `data_points` 对应数组按同索引取值，并拆分为多条标量记录写入数据库。
- 拆分记录可带 `trigger_index`，用于定位具体工位/通道。

### time_and_variable 配置（v1.3.3+）

```json
{
  "name": "time_and_variable_group_2",
  "interval_seconds": 5,
  "interval_point": "ProductCollectionInterval",
  "trigger": "time_and_variable",
  "trigger_interval_seconds": 0.5,
  "trigger_point": "bTrigger1",
  "data_points": ["ProductCode", "State"],
  "variable_point_overrides": {
    "ProductCode": "SnapshotProductCode"
  },
  "is_parallel": false
}
```

混合触发运行要点：
- 配置 `interval_point` 时按该 OPC UA 点位的秒数执行定时采集，否则按 `interval_seconds`。
- 每 `trigger_interval_seconds` 检测触发点上升沿，出现上升沿时立即采集。
- time 记录从 `data_points` 原点位读取；variable 记录对配置了 `variable_point_overrides` 的字段改读快照点，但输出字段名不变。
- 该模式用于“周期采样 + 事件快照”并存场景。

## 开发指南

### 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 运行特定测试
pytest tests/test_multi_communication.py -v

# 批次主表与年份分表重点测试
pytest tests/test_batch_year_partition.py tests/test_insert_feedback_and_unique.py tests/test_core.py -v
```

批次主表年份分表的 AI 测试指令与现场验证报告：

- `docs/AI_TEST_BATCH_MASTER_YEAR_PARTITIONING.md`
- `docs/AI_BATCH_PARTITION_LIVE_TEST_REPORT_20260708.md`

### 核心模块说明

1. **配置模块** (`core/`)
   - `config_models.py`: 定义数据点、数据组、通信连接等数据模型
   - `config_loader.py`: JSON 配置文件加载、解析和验证

2. **通信模块** (`communication/`)
   - `communication_manager.py`: 管理多个 OPC UA 客户端连接
   - `opcua_client.py`: OPC UA 客户端封装，支持断线重连
   - `data_collector.py`: 实现时间/变量/时间+变量三种采集逻辑
   - `opcua_feedback_writer.py`: 插入结果反馈写入 OPC UA
   - `heartbeat_manager.py`: 心跳信号管理，定时写入 OPC UA 保持连接活跃

3. **数据库模块** (`database/`)
   - `db_manager.py`: 数据库连接管理、年份表名计算、建表与索引维护
   - `data_storage.py`: 批量数据插入处理、批次主表上下文管理、开批/结批表检查

4. **主程序** (`main.py`)
   - 整合各模块，提供采集运行模式
   - 集成心跳管理和插入反馈

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
7. **批次表设计**: 启用批次主表时，确保所有明细组都包含同一个批次号点位，并按查询需求配置 `partition_interval_years`

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
