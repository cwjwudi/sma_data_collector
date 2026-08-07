# 更新日志

本文档记录 SMA 数据采集系统的所有重要更新和变更。

## [Unreleased]
### 强制节拍对齐与断线补采
- `time` / `time_and_variable` 数据组新增 `force_cadence_alignment` 与 `max_backfill_ticks`，按本机自然时间边界调度并限制恢复批次规模。
- OPC UA 运行期断连或全点读取失败后保留欠拍；恢复时单次读取当前快照，按原计划节拍时间补写并立即刷新数据库队列。
- 采集表新增固定列 `is_backfill`，既有目标表自动补列且历史行默认为 `0`，补采行为 `1`。
- Web 配置页新增节拍开关、补采上限和数据语义警告；运行快照新增补采批次、行数、截断与恢复失败指标。

### asyncua、触发订阅与完整重连状态机
- OPC UA 客户端由同步 `python-opcua` 迁移到原生异步 `asyncua`，批量读写、心跳、触发复位及插入反馈不再占用工作线程。
- 新增 `disconnected/connecting/connected/reconnecting/stopping` 连接状态、单重连任务、指数退避、操作超时和并发上限；重连成功会自动恢复全部触发订阅。
- `variable` 与 `time_and_variable` 新增 `trigger_mode: subscription`，同时保留 `poll` 兼容模式；并行布尔数组触发也支持订阅事件。
- Web 配置页将触发方式/间隔统一为“订阅”及 1–10 秒下拉选项，配置加载器继续接受旧配置中的任意正数间隔。
- OPC UA 浏览接口同步迁移为异步调用，运行快照新增连接状态与有效订阅数量。
- 新增单元测试、真实 PLC/MySQL 冒烟测试、主动断线恢复测试和至少一小时实机连续测试工具。

### SQLite 持久化采集队列
- 新增可选的 SQLite WAL outbox；PLC 触发确认语义升级为“本地持久化事务已提交”。
- 支持 pending/processing/retry/dead-letter/completed 状态、启动恢复、指数退避、最大重试次数和容量保护。
- deque 保留为运行期批处理缓存，MySQL/目标数据库调用移入工作线程，避免阻塞 OPC UA 事件循环。
- 停机等待正在执行的数据库工作线程后再刷新，修复调用已开始但提交指标尚未记账的竞态。
- 增加跨年分表运行期补建和失败回队，完整 pytest 当前为 127 passed。
- 新增 `tools/persistent_queue_admin.py`，支持统计、查看、JSON 导出和显式 dead-letter 重放。
- 新增运行期定期维护：按 `cleanup_interval_seconds` 清理超过 `completed_retention_days` 的成功记录，启动和正常停机时也会清理，避免长期连续运行导致 outbox 无界累积。
- 使用测试 PLC `192.168.50.233` 和实际 MySQL 完成定期清理实机验证：291 条接收/完成/清理完全一致，284 条提交、7 次明确业务唯一冲突，最终所有 outbox 状态为 0。
- 使用 `AA_SMA_DATA_TEST.json` 和测试 PLC `192.168.50.233` 完成 61 分钟全组实机压力测试：28,770 条 outbox 接收与终态完全一致，27,551 条提交、1,219 次明确唯一键冲突，零失败、零重试、零死信、零停机剩余。

### 并行触发与内存队列可靠性修复
- 并行数组按触发索引验证完整数据；缺点、空值和短数组索引不再入队或复位，保持高电平供后续重试。
- 并行触发复位增加读回确认，并修复复位后内部状态仍保存旧 `True` 导致快速重触发被吞的问题。
- 写复位成功但读回已再次为 `True` 时视为 PLC 新事件，不执行第二次清零，下一轮继续采集。
- MySQL 写入失败的批次保留在内存 `retry_queue` 中并自动重试，不再无记录地从 deque 消失。
- 不可自动重试的数据转换错误保留在内存 `dead_letter_queue`，并通过运行指标显式对账。
- 停机时先在表缓存有效期间刷新普通队列和重试队列，完成后才清理缓存；超时会保留并报告剩余行数。
- 运行快照新增队列、重试、提交、失败和停机刷新指标。
- 未启用持久化队列时，当前触发复位仍只表示“完整数据已进入内存 deque”；生产或关键测试建议启用 SQLite outbox。
- 使用 `AA_SMA_DATA_TEST.json` 对全部六个数据组完成 61 分钟真实 PLC/MySQL 压力测试；69985 行提交、83 次明确 Batch 唯一键冲突，队列和触发最终全部归零，详见 `docs/ALL_GROUPS_1H_STRESS_REPORT_20260713.md`。

### 批次主表与年份分表
- ✨ **批次主表驱动的年份分表**（`core/config_models.py`、`core/config_loader.py`、`database/db_manager.py`、`database/data_storage.py`、`runtime/collector_runtime.py`）
  - 新增 `groups[].partition_interval_years`，用于按日历年份桶分表，默认值为 `1`。
  - 一个配置中最多允许一张 `batch_upsert.enabled=true` 的批次主表；批次主表固定表名，不再追加年份后缀。
  - 启用批次主表后，所有非主表数据组都按批次主表的开批时间年份归表，不再区分“普通数据”和“批次数据”。
  - 未结批批次不跨表：即使自然时间进入新年份，明细数据仍写入该批次开批年份对应的表。
  - 支持多年份分表间隔，例如 `partition_interval_years=2` 时，2025/2026 归入 `_2025`，2027/2028 归入 `_2027`。

- 🧩 **配置约束与旧配置兼容**
  - 启用批次主表时，所有非主表数据组必须包含批次主表的 `unique_key_point`，用于确保明细数据可按批次归属。
  - 旧字段 `recreate_interval_days` 保留读取与写回兼容，但不再参与分表逻辑；旧配置缺少 `partition_interval_years` 时默认按 `1` 年处理。
  - Web 配置页将原分表字段调整为“分表间隔年份”，并在启用 `batch_upsert` 时锁定主表 `partition_interval_years=1`、`batch_insert_size=1`、`is_parallel=false`。

- 🗄️ **建表时机优化**
  - 表检查从“插入前逐条检查”调整为启动、开批、结批等切换点集中检查。
  - 程序启动时会确保批次主表存在，并尝试恢复 `end_time IS NULL` 的未结批上下文。
  - 开批或恢复未结批上下文后，系统会提前确保所有明细组的目标年份表存在。
  - 结批成功时会强制写入所有队列中的明细组数据，不再等待 `batch_insert_size` 达标。

- 🧪 **测试与现场验证**
  - 更新 `tests/test_batch_year_partition.py`，覆盖固定主表、开批年份归表、跨年结批、结批强制写入、启动恢复未结批与不逐条建表。
  - 更新 `tests/test_insert_feedback_and_unique.py`，覆盖批次主表唯一性和明细组必须包含批次号点位的配置校验。
  - 新增 AI 测试指令文档：`docs/AI_TEST_BATCH_MASTER_YEAR_PARTITIONING.md`。
  - 新增现场测试报告：`docs/AI_BATCH_PARTITION_LIVE_TEST_REPORT_20260708.md`，基于 `sample_config.json` 派生配置完成真实 OPC UA + MySQL 验证。

### 删除历史查询回写链路
- 移除 CLI `--query` 模式、`trigger=query` 采集分支、查询任务队列、数据库历史查询处理器和 OPC UA 查询缓冲区写入器。
- 配置校验改为拒绝 `trigger=query`、`groups[].query_config`、`groups[].output_mode` 与顶层 `http_server`。
- 保留并独立化插入反馈写入能力，新增 `communication/opcua_feedback_writer.py`。

## [v1.5.1] - 2026-05-11
### 配置与校验增强
- ✅ **点位名称与路径唯一性校验增强**（`web_config/config_manager.py`、`web_config/static/config.js`）
  - 配置保存与“加入 points”流程新增 `points.name` / `points.path` 重复校验，重复时直接阻止提交并给出明确报错。
  - Web 端新增点名规范化逻辑，降低非法字符导致的后续配置问题。

- 🔁 **变量触发轮询参数统一**（`core/config_models.py`、`core/config_loader.py`、`communication/data_collector.py`）
  - `trigger=variable` 与 `trigger=query` 轮询间隔统一支持 `trigger_interval_seconds`。
  - 当未显式配置时自动回退为 `interval_seconds`，保持历史配置兼容。
  - 校验与测试断言同步切换为 `trigger_interval_seconds` 语义。

### 心跳与运行监视优化
- 💓 **heartbeat 配置支持 points 引用**（`communication/heartbeat_manager.py`、`config/Alarm_trend.json`）
  - `connections[].heartbeat` 支持填写 `points[].name`，启动时自动解析为 OPC UA 地址。
  - 兼容旧地址直填方式（`ns=...`），同时给出迁移提示日志。

- 🪵 **Web 监视日志增量拉取与暂停能力**（`web_config/collector_host.py`、`web_config/main.py`、`web_config/static/dashboard.*`）
  - `/api/collector/logs` 新增 `cursor/limit`，支持按序号增量读取，减少重复传输与前端渲染压力。
  - 仪表盘新增“暂停日志/继续日志”按钮，暂停期间缓存增量，恢复后一次性补显。
  - 日志渲染与缓冲上限可控，提升长时间运行场景下的可读性与稳定性。

### 稳定性修复
- 🛠️ **数据库历史表日期初始化兼容修复**（`database/db_manager.py`）
  - 兼容 SQLAlchemy 2.x `Row` 返回结构，避免扫描历史表时取表名失败。
  - 增加无效表名跳过与调试信息，提升日期初始化问题定位效率。

### Web 体验改进
- 🔧 **配置页面联动刷新优化**（`web_config/static/config.js`、`web_config/static/config.html`）
  - 新增点位后，数据组/连接/数据库相关下拉选项即时刷新，无需整页重载。
  - 静态资源追加版本参数，降低缓存导致的前端脚本不一致问题。

---

## [v1.5.0] - 2026-05-11
### 文档与定位调整
- 🧭 **`web_config` 升级为推荐主入口**（`README.md`）
  - 强化“配置管理 + 采集托管 + 运行监视”定位说明。
  - 补充 `web_config` 目录结构与使用边界，明确日常运维优先走 Web 界面。

### 功能策略变更
- 🛑 **HTTP 推流能力移除并停止维护**（`README.md`）
  - 删除 HTTP 推流相关功能说明、开发扩展指引与架构描述。
  - `http_server` 配置段仅保留历史兼容语义：存在时告警并忽略。

- 🧱 **PLC 查询回写改为“仅保留”能力**（`README.md`）
  - 明确回写链路用于存量系统兼容与维护，不再作为新增功能方向。
  - 保留现有回写流程与配置说明，避免影响既有项目运行。

---


## [v1.3.6] - 2026-04-29
### 新增功能
- ✨ **组内唯一性校验与插入反馈**（`core/config_models.py`、`core/config_loader.py`、`database/data_storage.py`、`database/db_manager.py`、`main.py`、`communication/opcua_data_writer.py`）
  - `groups[]` 新增 `unique_key_point`：可配置组内唯一键点，插入前按当前目标表判重。
  - `groups[]` 新增 `insert_feedback`：支持按批次回写 UDINT 状态码，默认 `0=成功`、`1=唯一性冲突`、`2=数据库异常`、`3=其他失败`。
  - 新增 `DatabaseManager.record_exists()`，用于通用列值存在性查询。
  - 存储流程新增结果分类统计（`success / unique_conflict / db_error / other_error`），并按优先级回写反馈码。

### 配置约束与兼容性
- 🧩 **反馈点改为点名引用**（`core/config_loader.py`、`main.py`）
  - `insert_feedback.feedback_point` 现在必须引用 `points[].name`，不再直接填写 OPC UA 地址。
  - 启动时由系统自动将点名解析为对应 `path` 后执行回写。
- ✅ **变量触发间隔校验增强**（`core/config_loader.py`）
  - `trigger=variable` 时，`interval_seconds` 必须为数值且 `> 0`，避免运行期 `asyncio.sleep(None)` 异常。

### 日志系统优化
- 📝 **归档日志命名调整**（`main.py`）
  - 轮转文件名由 `data_collector.log.YYYY-MM-DD` 调整为 `data_collector.YYYY-MM-DD.log`。
  - 仅对新生成的归档文件生效，历史文件名保持不变。

### 测试与示例
- 🧪 新增测试：`tests/test_insert_feedback_and_unique.py`，覆盖配置校验、唯一性冲突、数据库异常反馈及变量触发间隔校验。
- 📄 新增最小联调配置：`config/unique_feedback_test_config.json`，用于验证唯一性与插入反馈链路。
- 📄 更新示例：`config/sample_config.json`，补充 `unique_key_point` 与 `insert_feedback` 配置示例。

---

## [v1.3.5] - 2026-04-28
### 新增功能
- ✨ **日志系统配置化升级**（`main.py`、`core/config_models.py`、`core/config_loader.py`）
  - 新增 `logging` 配置段，支持以下字段：
    - `level`：日志级别（`DEBUG/INFO/WARNING/ERROR/CRITICAL`）
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
  - 数据存储“批量插入完成”日志由 `info` 下调为 `debug`（`database/data_storage.py`），减少稳定运行期刷屏。

### 数据库日志与建表优化
- 🗄️ **MySQL SQL 详细日志**（`database/db_manager.py`）
  - 新增 SQL 语句与参数打印能力（MySQL），覆盖 `CREATE TABLE` / `SELECT` / `INSERT` 路径。
  - 新增环境变量 `SD_SMA_SQL_LOG_INFO`：开启后 SQL 明细提升为 `INFO`；默认按 `DEBUG` 输出。
- ⚡ **建表调用降噪优化**（`database/data_storage.py`）
  - 同一进程内同一张表仅首次执行“确保存在”逻辑，避免每批次重复 `CREATE TABLE IF NOT EXISTS` 与重复日志。

### 退出流程优化
- 🧯 **Ctrl+C 优雅关闭**（`main.py`）
  - 对 `asyncio.CancelledError` 与 `KeyboardInterrupt` 进行协同处理，关闭流程仍完整执行。
  - 抑制 Python 3.12 下 Ctrl+C 时额外 traceback 噪声，终端输出更干净。

### 工程化改进
- 🧰 **依赖分层与初始化增强**（`init.py`、`requirements.txt`、`requirements-dev.txt`）
  - 运行依赖与开发/测试依赖拆分：`requirements.txt`（运行）+ `requirements-dev.txt`（测试/格式化/静态检查）。
  - `init.py` 改为基于脚本绝对路径安装依赖，避免受当前工作目录影响。
  - 新增 `python init.py --dev`，可一键安装开发依赖（含 `asyncua` 测试依赖）。

### 配置文件
- 📄 新增示例：`config/time_and_variable_logging_config.json`（基于 `time_and_variable_config.json`，包含完整日志参数示例）。
- 📄 更新示例：`config/sample_config.json`、`config/time_and_variable_config.json`、`config/trend_config.json`、`config/pallel_test_config.json` 增加 `logging.output_dir` 示例字段。

### 日志参数说明（`logging`）
- `output_dir`
  - 日志输出目录；支持相对路径与绝对路径。
  - 相对路径按 `main.py` 所在目录解析；未配置时默认使用 `main.py` 同级 `logs` 目录。
  - 目录优先级：`logging.output_dir` > 环境变量 `SD_SMA_LOG_DIR` > 默认 `logs`。

- `level`
  - 日志级别：`DEBUG/INFO/WARNING/ERROR/CRITICAL`。
  - 默认值：`INFO`；可通过配置精细控制日志量（例如生产使用 `INFO`，排障使用 `DEBUG`）。

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
