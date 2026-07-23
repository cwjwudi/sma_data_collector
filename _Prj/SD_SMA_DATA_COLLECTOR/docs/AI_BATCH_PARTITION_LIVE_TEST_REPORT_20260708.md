# 批次主表年份分表现场测试报告

测试日期：2026-07-08  
测试版本：`288b46e Implement batch-master year partitioning`  
测试结论：通过

## 1. 测试目标

本次测试基于 `config/sample_config.json` 的 OPC UA 和 MySQL 连接信息，新建一份专用测试配置，验证以下功能：

1. 批次主表固定表名，不加年份后缀。
2. 明细表按批次主表的开批时间年份归表。
3. 跨年结批时，明细表仍写入开批年份表。
4. `partition_interval_years=2` 时，2025/2026 合并到 `_2025`，2027 切到 `_2027`。
5. 明细组未达到 `batch_insert_size` 时，结批触发必须强制落库。
6. 启动后能恢复未结批批次上下文。
7. 结批和明细插入阶段不再逐条执行建表。

## 2. 测试环境

原始配置：

```text
config/sample_config.json
```

测试生成配置：

```text
config/ai_bp_0708101057_from_sample.json
```

测试结果 JSON：

```text
docs/ai_bp_0708101057_live_results.json
```

连接信息：

```text
OPC UA: opc.tcp://192.168.50.233:4840
MySQL/MariaDB: 192.168.50.22:3306 / wn_10
DB version: 10.11.11-MariaDB
```

说明：报告中不记录数据库密码。测试过程中临时写入了 OPC UA 批次测试点位，测试结束后已恢复原值。

## 3. 测试配置设计

测试前从 `sample_config.json` 复制通信和数据库配置，并新增 3 个测试数据组。

批次主表：

```text
group: ai_bp_0708101057_hdr
table: ai_bp_0708101057_hdr
batch_upsert.enabled: true
unique_key_point: strBatchCode
start_time_point: dtBtachStartTime
end_time_point: dtBtachEndTime
trigger_point: bBatchTriger
batch_insert_size: 1
```

1 年分表明细组：

```text
group: ai_bp_0708101057_d1y
partition_interval_years: 1
data_points: strBatchCode, rEC, rF10
trigger_point: bDetailTrigger
batch_insert_size: 100
```

2 年分表明细组：

```text
group: ai_bp_0708101057_d2y
partition_interval_years: 2
data_points: strBatchCode, rAIR, rAP1
trigger_point: bDetailTrigger
batch_insert_size: 100
```

为了避免没有开批时明细组自动采集，本次明细组使用变量触发，不使用定时触发。这样可以严格控制“开批 -> 触发明细 -> 结批强制落库”的顺序。

## 4. 连接和点位检查

MySQL 连接结果：

```text
PASS database connects
database: wn_10
version: 10.11.11-MariaDB
```

OPC UA 写权限检查：

| 点位 | 路径 | 结果 |
|---|---|---|
| `strBatchCode` | `ns=6;s=::DataGen:strBatchCode` | 可写 |
| `dtBtachStartTime` | `ns=6;s=::DataGen:dtBtachStartTime` | 可写 |
| `dtBtachEndTime` | `ns=6;s=::DataGen:dtBtachEndTime` | 可写 |
| `bBatchTriger` | `ns=6;s=::DataGen:bBatchTriger` | 可写 |
| `bDetailTrigger` | `ns=6;s=::DataRev:bTestTriger` | 可写 |

## 5. 自动化测试结果

重点单元测试：

```powershell
..\..\.venv\Scripts\python.exe -m pytest tests\test_batch_year_partition.py tests\test_insert_feedback_and_unique.py tests\test_core.py
```

结果：

```text
26 passed
```

主要测试集合：

```powershell
..\..\.venv\Scripts\python.exe -m pytest tests --ignore=tests\test_time.py --ignore=tests\test_mysql.py
```

结果：

```text
45 passed, 3 warnings
```

说明：3 个 warning 是既有的 `tests/test_datatype.py` 测试函数返回值提示，不是本次功能失败。

## 6. 端到端测试过程

端到端测试使用真实 OPC UA 触发、真实 MySQL 写入。每个批次流程如下：

1. 启动采集系统。
2. 写入 `strBatchCode`、`dtBtachStartTime`、`dtBtachEndTime`。
3. 触发 `bBatchTriger` 开批。
4. 触发 `bDetailTrigger` 采集明细。
5. 明细组 `batch_insert_size=100`，确认队列内只有 1 条，未达到批量阈值。
6. 再次触发 `bBatchTriger` 结批。
7. 检查明细是否被结批强制写入。
8. 停止采集系统。

## 7. 用例结果

### 7.1 2025 开批，2026 结批

批次：

```text
batch_no: ai_bp_0708101057_B2025
start_time: 2025-12-31 23:50:00
end_time: 2026-01-01 00:05:00
```

结果：

| 检查项 | 预期 | 实际 |
|---|---|---|
| 主表插入 | `ai_bp_0708101057_hdr` | 通过 |
| 主表无年份后缀 | 不存在 `_2025/_2026/_2027` 主表 | 通过 |
| 1 年明细 | `ai_bp_0708101057_d1y_2025` | 1 行 |
| 2 年明细 | `ai_bp_0708101057_d2y_2025` | 1 行 |
| 错误年份表 | 不写入 `_2026` | 通过 |
| 未满批量强制落库 | 队列 1 条也落库 | 通过 |
| 结批/明细插入阶段建表调用 | 0 次 | 通过 |

结论：跨年结批没有切到 2026，明细仍按开批年份 2025 写入。

### 7.2 2026 开批，验证 2 年分表合桶

批次：

```text
batch_no: ai_bp_0708101057_B2026
start_time: 2026-01-01 00:10:00
end_time: 2026-01-01 00:30:00
```

结果：

| 检查项 | 预期 | 实际 |
|---|---|---|
| 1 年明细 | `ai_bp_0708101057_d1y_2026` | 1 行 |
| 2 年明细 | `ai_bp_0708101057_d2y_2025` | 1 行 |
| 2 年明细错误表 | 不生成/不写入 `ai_bp_0708101057_d2y_2026` | 通过 |
| 结批/明细插入阶段建表调用 | 0 次 | 通过 |

结论：`partition_interval_years=2` 时，2026 正确归入 2025 桶。

### 7.3 2027 开批，验证 2 年分表切新桶

批次：

```text
batch_no: ai_bp_0708101057_B2027
start_time: 2027-01-01 00:10:00
end_time: 2027-01-01 00:30:00
```

结果：

| 检查项 | 预期 | 实际 |
|---|---|---|
| 1 年明细 | `ai_bp_0708101057_d1y_2027` | 1 行 |
| 2 年明细 | `ai_bp_0708101057_d2y_2027` | 1 行 |
| 2 年明细旧桶 | 本批次不写入 `ai_bp_0708101057_d2y_2025` | 0 行 |
| 结批/明细插入阶段建表调用 | 0 次 | 通过 |

结论：`partition_interval_years=2` 时，2027 正确切到新桶 `_2027`。

### 7.4 重启恢复未结批

批次：

```text
batch_no: ai_bp_0708101057_RESTART_2025
start_time: 2025-12-31 22:00:00
end_time: 2026-01-01 00:20:00
```

过程：

1. 第一次启动采集器。
2. 开批后不结批，停止采集器。
3. 第二次启动采集器。
4. 初始化阶段恢复未结批上下文。
5. 触发明细采集。
6. 触发结批。

结果：

| 检查项 | 预期 | 实际 |
|---|---|---|
| 重启后上下文 | 恢复 `AI...RESTART_2025`，年份 2025 | 通过 |
| 1 年明细 | `ai_bp_0708101057_d1y_2025` | 1 行 |
| 2 年明细 | `ai_bp_0708101057_d2y_2025` | 1 行 |
| 恢复后结批/明细插入建表调用 | 0 次 | 通过 |

结论：程序重启后可以根据批次主表中的 `end_time IS NULL` 记录恢复开批年份上下文。

## 8. 最终数据库表状态

主表：

```text
ai_bp_0708101057_hdr: 存在
ai_bp_0708101057_hdr_2025: 不存在
ai_bp_0708101057_hdr_2026: 不存在
ai_bp_0708101057_hdr_2027: 不存在
```

1 年分表明细：

```text
ai_bp_0708101057_d1y_2025: 存在
ai_bp_0708101057_d1y_2026: 存在
ai_bp_0708101057_d1y_2027: 存在
```

2 年分表明细：

```text
ai_bp_0708101057_d2y_2025: 存在
ai_bp_0708101057_d2y_2026: 不存在
ai_bp_0708101057_d2y_2027: 存在
```

这个结果证明：

```text
1 年分表：2025 -> _2025，2026 -> _2026，2027 -> _2027
2 年分表：2025 -> _2025，2026 -> _2025，2027 -> _2027
```

## 9. 建表策略验证

每个用例在开批后清空建表调用记录，然后执行：

```text
触发明细采集 -> 明细入队但不满 batch_insert_size -> 触发结批 -> 强制写入明细
```

结果：

| 用例 | 结批/明细插入阶段 `create_data_table` 调用 |
|---|---|
| 2025 跨年结批 | 0 |
| 2026 两年合桶 | 0 |
| 2027 两年新桶 | 0 |
| 重启恢复后结批 | 0 |

结论：明细插入前没有逐条建表；表检查发生在启动、开批、恢复上下文这些切换点。

## 10. 保留的测试数据

本次没有清理数据库测试表，便于复核。测试表前缀：

```text
ai_bp_0708101057
```

可用以下 SQL 查看：

```sql
SHOW TABLES LIKE 'ai_bp_0708101057%';

SELECT * FROM `ai_bp_0708101057_hdr`
WHERE `strBatchCode` LIKE 'ai_bp_0708101057%';
```

如需清理，可在确认后执行：

```sql
DROP TABLE IF EXISTS
  `ai_bp_0708101057_hdr`,
  `ai_bp_0708101057_d1y_2025`,
  `ai_bp_0708101057_d1y_2026`,
  `ai_bp_0708101057_d1y_2027`,
  `ai_bp_0708101057_d2y_2025`,
  `ai_bp_0708101057_d2y_2027`;
```

## 11. 结论

本次现场测试通过。基于 `sample_config.json` 派生出的真实 OPC UA + MySQL 测试证明：

1. 批次主表固定表名正常。
2. 明细表按开批年份归表正常。
3. 跨年结批不跨表正常。
4. 结批强制写入未满批量明细正常。
5. `partition_interval_years=2` 的年份桶逻辑正常。
6. 重启恢复未结批上下文正常。
7. 结批/明细插入阶段没有逐条建表。

未发现功能失败项。
