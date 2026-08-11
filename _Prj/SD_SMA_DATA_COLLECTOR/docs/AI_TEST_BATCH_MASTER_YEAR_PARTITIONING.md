# AI 测试指令：批次主表驱动的年份分表

本文档用于交给任意 AI 测试员执行。测试员只负责验证和报告，不要修改业务代码；如果发现问题，先记录复现步骤、证据和影响范围。

## 1. 测试范围

工作目录：

```powershell
C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
```

关联提交：

```text
288b46e Implement batch-master year partitioning
```

本次要覆盖的功能：

1. 一个配置中最多只能启用一张 `batch_upsert.enabled=true` 的批次主表。
2. 批次主表固定表名，不加年份后缀。
3. 其他所有数据组都按批次主表的开批时间年份归表，不再区分“普通数据”和“批次数据”。
4. 未结批批次不跨表：即使自然时间跨年，仍写入开批年份对应的明细表。
5. 结批成功时，所有其他数据组必须立即写入各自目标表，不等待 `batch_insert_size`。
6. 插入前不再每条数据执行建表检查；建表检查集中在启动、开批、结批这些切换点。
7. 程序启动时能恢复未结批批次上下文，并继续使用该批次开批年份。
8. 新字段 `partition_interval_years` 表示分表间隔年份，默认值为 `1`。
9. 旧字段 `recreate_interval_days` 保留兼容，但不参与分表逻辑。
10. 配置页需要展示“分表间隔年份”，加载旧配置时默认补 `partition_interval_years=1`。
11. 启用批次主表后，其他所有数据组必须包含批次主表的批次号点位。

涉及核心文件：

```text
core/config_models.py
core/config_loader.py
database/db_manager.py
database/data_storage.py
runtime/collector_runtime.py
web_config/static/config.js
tests/test_batch_year_partition.py
tests/test_insert_feedback_and_unique.py
```

## 2. 测试原则

1. 不要直接改生产配置和生产数据库。
2. 可以创建临时测试配置、临时数据库、临时表，但测试完成后要说明创建了什么。
3. 发现失败时不要自动修代码，除非用户明确要求。
4. 记录每一步的命令、结果、截图或 SQL 输出。
5. 最终报告要区分：
   - 已通过
   - 未执行
   - 失败
   - 需要用户确认的数据配置问题

## 3. 基础环境检查

在仓库根目录检查状态：

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada
git status --short
git log --oneline -5
```

预期：

```text
最新提交包含 288b46e Implement batch-master year partitioning
```

允许存在与本测试无关的未提交文件，例如：

```text
_Launcher/launcher_config.json
```

不要把无关脏文件当成本功能失败。

## 4. 自动化测试

进入采集器目录：

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
```

### 4.1 Python 语法检查

```powershell
..\..\.venv\Scripts\python.exe -m compileall core database runtime tests\test_batch_year_partition.py
```

预期：

```text
命令退出码为 0
无 Python 语法错误
```

### 4.2 配置页 JS 语法检查

回到仓库根目录执行：

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada
node --check _Prj\SD_SMA_DATA_COLLECTOR\web_config\static\config.js
```

预期：

```text
命令退出码为 0
无语法错误输出
```

### 4.3 重点单元测试

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
..\..\.venv\Scripts\python.exe -m pytest tests\test_batch_year_partition.py tests\test_insert_feedback_and_unique.py tests\test_core.py
```

预期：

```text
26 passed
```

必须确认覆盖点：

1. `BatchData_2025` 和 `BatchData_2026` 按自然年份切表。
2. 批次主表使用固定表名。
3. 开批后明细表使用开批年份。
4. 明细数据不按采集时间年份切表。
5. 结批时未满批量的数据也会写入。
6. 一个配置只能启用一个批次主表。
7. 明细组必须包含批次号点位。

### 4.4 主要测试集合

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
..\..\.venv\Scripts\python.exe -m pytest tests --ignore=tests\test_time.py --ignore=tests\test_mysql.py
```

预期：

```text
45 passed
```

允许出现已有的 `PytestReturnNotNoneWarning`，但不能有测试失败。

### 4.5 配置文件加载扫描

```powershell
cd C:\Users\BR\codex_ws\p000_sd_sma_scada\_Prj\SD_SMA_DATA_COLLECTOR
@'
from pathlib import Path
from core.config_loader import ConfigLoader

for p in sorted(Path("config").glob("*.json")):
    try:
        ConfigLoader.load_from_file(str(p))
        print(f"OK {p.name}")
    except Exception as exc:
        print(f"FAIL {p.name}: {exc}")
'@ | ..\..\.venv\Scripts\python.exe -
```

预期：

```text
大部分配置 OK
config/test.json 可能失败，原因应为：
数据组 'TestGroup1' 必须包含批次主表的批次号点位 strBatchCode
```

这不是程序缺陷，而是新规则生效。测试员需要在报告里写清楚：该配置启用了批次主表，但非主表数据组缺少批次号点位。

## 5. 代码级验证

测试员需要阅读以下位置，确认逻辑没有偏离需求。

### 5.1 配置模型

文件：

```text
core/config_models.py
```

检查：

1. `DataGroup` 有 `partition_interval_years: int = 1`。
2. `recreate_interval_days` 仍保留，但注释说明是旧版字段，不参与分表逻辑。

### 5.2 配置加载和校验

文件：

```text
core/config_loader.py
```

检查：

1. 加载旧配置时，缺少 `partition_interval_years` 应默认变成 `1`。
2. `partition_interval_years < 1` 会被拒绝。
3. 多个 `batch_upsert.enabled=true` 会被拒绝。
4. 有批次主表时，其他数据组必须包含主表 `unique_key_point`。
5. `batch_upsert.start_time_point` 和 `batch_upsert.end_time_point` 必须存在于主表 `data_points`。

### 5.3 表名计算

文件：

```text
database/db_manager.py
```

检查：

1. `fixed_table=True` 时返回原始组名。
2. `partition_interval_years=1` 时：
   - `2025-12-31` -> `_2025`
   - `2026-01-01` -> `_2026`
3. `partition_interval_years=2` 时：
   - `2025` 和 `2026` 应进入同一个 `_2025` 桶。
   - `2027` 应进入 `_2027` 桶。

### 5.4 数据写入流程

文件：

```text
database/data_storage.py
```

检查：

1. `initialize_tables_for_runtime()` 在启动时检查表。
2. 有批次主表时，启动先确保主表固定表存在。
3. 如果主表中存在未结批记录，启动恢复 `current_batch_context`。
4. 开批成功后调用批次上下文更新，并确保明细表存在。
5. 明细组取表名时使用当前批次上下文的 `start_time`。
6. 主表结批成功后保留关闭批次上下文，强制 flush 所有组，然后清空上下文。
7. `_process_data_by_groups()` 发现主表结批记录时，`force_flush_all=True`。
8. 主表组先处理，明细组后处理。
9. `_process_group_data()` 插入前只检查目标表是否已经被启动、开批或结批流程确认过，不在每条插入前建表。

### 5.5 运行时注入配置

文件：

```text
runtime/collector_runtime.py
```

检查：

1. 每个数据组的 `partition_interval_years` 传入 `DatabaseManager`。
2. 每个数据组的 `data_points` 传入 `DataStorageProcessor`。
3. 启用了 `batch_upsert` 的组被设置为批次主表。
4. 初始化数据库连接后，会调用 `initialize_tables_for_runtime()`。

### 5.6 配置页

文件：

```text
web_config/static/config.js
```

检查：

1. 页面字段显示“分表间隔年份”。
2. 输入框绑定 `partition_interval_years`，不是 `recreate_interval_days`。
3. 旧配置加载后自动补 `partition_interval_years=1`。
4. 新建数据组时有 `partition_interval_years: 1`。
5. 启用 `batch_upsert` 后：
   - 当前组 `batch_insert_size=1`
   - 当前组 `partition_interval_years=1`
   - 当前组 `is_parallel=false`
   - 其他组的 `batch_upsert.enabled` 被关闭

## 6. 配置页人工测试

前提：采集器 Web 服务已启动，浏览器打开：

```text
http://127.0.0.1:8091/config
```

### 6.1 字段显示

步骤：

1. 打开配置页。
2. 进入“数据组”。
3. 查看原来“分表间隔(最少365天)”的位置。

预期：

```text
字段标题为“分表间隔年份”
默认值为 1
```

### 6.2 旧字段兼容

步骤：

1. 打开一个旧配置，旧配置中可以只有 `recreate_interval_days`，没有 `partition_interval_years`。
2. 进入“数据组”。

预期：

```text
页面显示 partition_interval_years 的输入值为 1
保存后 JSON 中保留 recreate_interval_days，同时写入 partition_interval_years
```

### 6.3 批次主表唯一性

步骤：

1. 给数据组 A 启用 `batch_upsert`。
2. 再给数据组 B 启用 `batch_upsert`。
3. 保存或重新查看 A。

预期：

```text
最终只能有一个数据组的 batch_upsert.enabled=true
后启用的组会让其他组关闭 batch_upsert.enabled
```

### 6.4 批次主表锁定项

步骤：

1. 对某数据组启用 `batch_upsert`。

预期：

```text
batch_insert_size 自动为 1
partition_interval_years 自动为 1
is_parallel 自动为 false
相关输入项不可编辑或保存后保持锁定值
```

## 7. 数据库端到端测试

本节建议用测试数据库。不要用生产库。

建议创建三个测试组：

```text
BatchGroup    批次主表，启用 batch_upsert
DetailA       明细表，包含批次号点位
DetailB       明细表，包含批次号点位
```

建议点位：

```text
strBatchCode      批次号，字符串，作为 BatchGroup 的 unique_key_point
dtBatchStartTime  开批时间，datetime
dtBatchEndTime    结批时间，datetime
valueA            明细值
valueB            明细值
triggerBatch      批次触发点
triggerA          DetailA 触发点
triggerB          DetailB 触发点
```

`BatchGroup.batch_upsert` 配置：

```json
{
  "enabled": true,
  "start_time_point": "dtBatchStartTime",
  "end_time_point": "dtBatchEndTime",
  "update_only_when_end_time_is_null": true,
  "reject_when_end_time_exists": true,
  "allow_idempotent_same_end_time": true
}
```

明细组要求：

```text
DetailA.data_points 必须包含 strBatchCode
DetailB.data_points 必须包含 strBatchCode
```

为了测试“结批强制写入”，把明细组的 `batch_insert_size` 设置为较大值，例如：

```text
DetailA.batch_insert_size = 100
DetailB.batch_insert_size = 100
```

### 7.1 批次主表固定表名

步骤：

1. 启动程序。
2. 触发一次开批：

```text
strBatchCode = AI_TEST_2025_001
dtBatchStartTime = 2025-12-31 23:50:00
dtBatchEndTime = 空
```

预期：

```text
数据库中存在 BatchGroup
数据库中不应因主表产生 BatchGroup_2025 或 BatchGroup_2026
BatchGroup 中有 AI_TEST_2025_001，end_time 为空
```

MySQL 检查示例：

```sql
SHOW TABLES LIKE 'BatchGroup%';
SELECT * FROM BatchGroup WHERE strBatchCode = 'AI_TEST_2025_001';
```

### 7.2 明细按开批年份归表

步骤：

1. 保持 `AI_TEST_2025_001` 未结批。
2. 触发 `DetailA` 和 `DetailB` 各至少一条数据。
3. 当前真实日期即使不是 2025，也不影响结果。

预期：

```text
DetailA 的数据写入或等待写入 DetailA_2025
DetailB 的数据写入或等待写入 DetailB_2025
不能写入 DetailA_2026 或 DetailB_2026
```

如果明细组 `batch_insert_size=100`，此时数据可能还在队列里，不一定马上入库。继续执行 7.3 验证结批强制写入。

### 7.3 结批强制写入

步骤：

1. 在明细未达到 `batch_insert_size` 的情况下触发结批：

```text
strBatchCode = AI_TEST_2025_001
dtBatchStartTime = 2025-12-31 23:50:00
dtBatchEndTime = 2026-01-01 00:05:00
```

2. 等待一个处理周期。

预期：

```text
BatchGroup 中该批次 end_time 被更新为 2026-01-01 00:05:00
DetailA 和 DetailB 队列中未满批量的数据立刻落库
明细数据仍写入 DetailA_2025 和 DetailB_2025
不能因为结批时间是 2026 就写入 _2026
```

MySQL 检查示例：

```sql
SELECT strBatchCode, dtBatchStartTime, dtBatchEndTime
FROM BatchGroup
WHERE strBatchCode = 'AI_TEST_2025_001';

SELECT COUNT(*) FROM DetailA_2025 WHERE strBatchCode = 'AI_TEST_2025_001';
SELECT COUNT(*) FROM DetailB_2025 WHERE strBatchCode = 'AI_TEST_2025_001';

SELECT COUNT(*) FROM DetailA_2026 WHERE strBatchCode = 'AI_TEST_2025_001';
SELECT COUNT(*) FROM DetailB_2026 WHERE strBatchCode = 'AI_TEST_2025_001';
```

预期：

```text
DetailA_2025 count > 0
DetailB_2025 count > 0
DetailA_2026 count = 0 或表不存在
DetailB_2026 count = 0 或表不存在
```

### 7.4 新批次跨年切换

步骤：

1. 开一个新批次：

```text
strBatchCode = AI_TEST_2026_001
dtBatchStartTime = 2026-01-01 00:10:00
dtBatchEndTime = 空
```

2. 触发 `DetailA` 和 `DetailB`。
3. 触发结批：

```text
strBatchCode = AI_TEST_2026_001
dtBatchStartTime = 2026-01-01 00:10:00
dtBatchEndTime = 2026-01-01 00:30:00
```

预期：

```text
AI_TEST_2026_001 的明细写入 DetailA_2026 和 DetailB_2026
AI_TEST_2025_001 的明细仍保留在 DetailA_2025 和 DetailB_2025
```

### 7.5 启动恢复未结批批次

步骤：

1. 开批但不结批：

```text
strBatchCode = AI_TEST_RESTART_2025
dtBatchStartTime = 2025-12-31 22:00:00
dtBatchEndTime = 空
```

2. 确认 `BatchGroup` 中有该未结批记录。
3. 停止采集器。
4. 重新启动采集器。
5. 触发 `DetailA` 或 `DetailB`。
6. 再触发该批次结批。

预期：

```text
启动后程序恢复未结批批次上下文
明细数据写入 2025 年表
日志中最好能看到类似“恢复未结批批次上下文”的信息
```

MySQL 检查示例：

```sql
SELECT COUNT(*) FROM DetailA_2025 WHERE strBatchCode = 'AI_TEST_RESTART_2025';
SELECT COUNT(*) FROM DetailA_2026 WHERE strBatchCode = 'AI_TEST_RESTART_2025';
```

预期：

```text
DetailA_2025 count > 0
DetailA_2026 count = 0 或表不存在
```

### 7.6 未开批时明细数据不应乱写

步骤：

1. 确保没有未结批批次。
2. 不触发 `BatchGroup` 开批。
3. 直接触发 `DetailA`。

预期：

```text
程序不应把明细数据写到当前年份表
应记录无法确定批次上下文的错误
```

这是保护行为，防止明细数据因为没有批次上下文而进入错误年份表。

### 7.7 两年分表间隔

仅用于验证 `partition_interval_years`，当前业务默认推荐仍是 `1`。

步骤：

1. 设置 `DetailA.partition_interval_years=2`。
2. 开批：

```text
AI_TEST_INTERVAL_2025, start=2025-12-31 23:00:00
```

3. 结批。
4. 开批：

```text
AI_TEST_INTERVAL_2026, start=2026-01-01 01:00:00
```

5. 结批。
6. 开批：

```text
AI_TEST_INTERVAL_2027, start=2027-01-01 01:00:00
```

7. 结批。

预期：

```text
2025 和 2026 的 DetailA 数据进入 DetailA_2025
2027 的 DetailA 数据进入 DetailA_2027
```

## 8. 负向配置测试

这些测试可以通过配置页校验或直接调用 `ConfigLoader.load_from_file()` 完成。

### 8.1 两个批次主表

构造配置：

```text
GroupA.batch_upsert.enabled=true
GroupB.batch_upsert.enabled=true
```

预期：

```text
加载失败
错误包含：同一配置中只能启用一张 batch_upsert 批次主表
```

### 8.2 明细组缺少批次号点位

构造配置：

```text
BatchGroup.unique_key_point=strBatchCode
DetailA.data_points 不包含 strBatchCode
```

预期：

```text
加载失败
错误包含：必须包含批次主表的批次号点位 strBatchCode
```

### 8.3 批次主表缺少唯一键

构造配置：

```text
BatchGroup.batch_upsert.enabled=true
BatchGroup.unique_key_point 为空
```

预期：

```text
加载失败
错误包含：启用了 batch_upsert 时必须配置 unique_key_point
```

### 8.4 批次主表缺少开批或结批点位

构造配置：

```text
batch_upsert.start_time_point 为空或不在 data_points
batch_upsert.end_time_point 为空或不在 data_points
```

预期：

```text
加载失败
错误说明 start_time_point 或 end_time_point 必须配置且存在于 data_points
```

### 8.5 非法分表间隔年份

构造配置：

```text
partition_interval_years = 0 或负数
```

预期：

```text
加载后会被默认修正为 1，或校验时拒绝小于 1 的值
最终不能让运行时使用小于 1 的分表间隔
```

## 9. 建表策略验证

目标：确认插入前不再每条数据都执行建表。

### 9.1 单元测试证据

检查并运行：

```text
tests/test_batch_year_partition.py
```

重点测试：

```text
test_detail_data_uses_master_start_year_not_collection_time
```

预期：

```text
开批后重置 create_data_table mock
处理明细数据时 db_manager.create_data_table.assert_not_called()
```

这说明明细插入阶段没有再每条数据执行建表。

### 9.2 运行时证据

在真实数据库测试中观察日志或数据库 general log：

预期：

```text
启动时检查主表
开批时检查对应年份明细表
结批时再次检查对应年份明细表
普通明细插入过程中不应反复出现 CREATE TABLE IF NOT EXISTS
```

## 10. 最终报告模板

测试完成后，请按下面格式向用户报告。

```markdown
## 测试结论

总体结论：通过 / 部分通过 / 未通过

测试版本：
- commit:
- 测试时间:
- 测试数据库:
- 测试配置:

## 自动化测试

| 项目 | 结果 | 证据 |
|---|---|---|
| compileall | 通过/失败 | 输出摘要 |
| node --check | 通过/失败 | 输出摘要 |
| 重点单测 | 通过/失败 | 例如 26 passed |
| 主要测试集合 | 通过/失败 | 例如 45 passed |
| 配置扫描 | 通过/失败 | 列出 FAIL 配置及原因 |

## 功能测试

| 功能 | 结果 | 证据 |
|---|---|---|
| 只能启用一张批次主表 | 通过/失败 | 截图或错误信息 |
| 批次主表固定表名 | 通过/失败 | SQL 输出 |
| 明细按开批年份归表 | 通过/失败 | SQL 输出 |
| 未结批不跨表 | 通过/失败 | SQL 输出 |
| 结批强制写入 | 通过/失败 | SQL 输出 |
| 启动恢复未结批 | 通过/失败 | 日志和 SQL 输出 |
| 不逐条建表 | 通过/失败 | 单测或日志证据 |
| 配置页字段和默认值 | 通过/失败 | 截图 |
| 旧字段兼容 | 通过/失败 | JSON 或页面证据 |

## 发现的问题

1. 问题标题
   - 严重程度:
   - 复现步骤:
   - 实际结果:
   - 预期结果:
   - 证据:
   - 建议:

## 需要用户确认

- 是否允许修改某个旧配置文件
- 是否允许清理测试表
- 是否需要继续做 PLC 实机测试
```

## 11. 通过标准

本功能可以判定通过，需要同时满足：

1. 自动化测试无失败。
2. 批次主表固定表名，不产生年份后缀主表。
3. 所有非主表数据组都按批次主表开批年份写入。
4. 跨年结批不会导致明细写入结批年份。
5. 新批次开批年份变化后，明细表跟随新开批年份变化。
6. 结批能强制写入未满批量的明细数据。
7. 重启后能恢复未结批上下文。
8. 配置页和配置加载都能正确处理 `partition_interval_years`。
9. 旧字段 `recreate_interval_days` 不再影响分表结果。
10. 违反新规则的配置会被明确拒绝，而不是静默写错表。
