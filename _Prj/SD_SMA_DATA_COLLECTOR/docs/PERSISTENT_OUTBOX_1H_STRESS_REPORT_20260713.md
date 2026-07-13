# SQLite 持久化 outbox 一小时实机压力测试报告

## 测试范围

- 日期：2026-07-13
- 分支：`feature/collector-persistent-outbox`
- PLC：`192.168.50.233`，专用测试 PLC
- 配置：仓库顶层 `config/collector/AA_SMA_DATA_TEST.json`
- 目标数据库：配置中的 MySQL 测试库
- outbox：`runtime/queue/aa_sma_data_test_outbox.db`
- 正式持续时间：3661.75 秒（61 分 1.75 秒）
- PLC 程序：未构建、未下载、未修改

测试启用 SQLite WAL、`synchronous=FULL`。变量触发组循环写入配置中已有的 OPC UA 测试触发点；Alarm/Audit 使用数组索引 70–79，避开 PLC 演示程序自行使用的 0、10、49 等索引。Data_Product 保持配置规定的纯时间触发方式，没有把其布尔点计入触发确认。

## 全组结果

| 数据组 | 触发尝试 | PLC 确认复位 | 采集回调行数 |
|---|---:|---:|---:|
| Data_Recipe | 1219 | 1219 | 1219 |
| Data_Product | 时间触发 | 不适用 | 733 |
| Data_Alarm | 1219 × 10 索引 | 1219 × 10 索引 | 12190 |
| Data_Audit | 1219 × 10 索引 | 1219 × 10 索引 | 12190 |
| Data_Batch | 1219 | 1219 | 1219 |
| Data_BatchInfo | 1219 | 1219 | 1219 |

所有主动变量触发均完成采集器确认复位，测试脚本记录错误为 0。正式测试选用的 Alarm/Audit 索引 70–79 在停机前独立读回均为 `False`。

## outbox 与数据库对账

| 指标 | 数量 |
|---|---:|
| outbox 接收 | 28770 |
| outbox 完成 | 28770 |
| 目标数据库提交 | 27551 |
| 业务唯一键冲突 | 1219 |
| 数据库失败 | 0 |
| 数据转换死信 | 0 |
| 最终 pending | 0 |
| 最终 processing | 0 |
| 最终 retry | 0 |
| 最终 dead-letter | 0 |
| 停机剩余 | 0 |

`Data_Batch` 使用固定批次号时触发 1219 次业务唯一键冲突；该结果由现有唯一键/upsert 业务规则明确消费，因此满足 `27551 + 1219 = 28770`，与 outbox 完成数完全一致。

运行中在约 8、16、24、30、38、46、54 分钟做了非侵入式 SQLite 状态检查。pending 只在 0–12 条之间随批次波动并持续回落，processing/retry/dead-letter 始终为 0。最终 outbox 主文件约 53.35 MB；成功记录按配置保留一天用于审计。

## 自动化故障验证

`tests/test_persistent_queue.py` 覆盖：

- SQLite 提交失败时不进入 deque，采集回调抛错，因此 PLC 不会被确认。
- WAL、schema version 和 datetime 无损恢复。
- processing 记录在非正常退出后恢复为 pending。
- 子进程 `os._exit(23)` 强制终止后重新打开并恢复记录。
- 目标数据库失败转入持久化 retry。
- 不可重试数据进入持久化 dead-letter，并可导出、显式重放。
- 达到 outbox 容量上限时事务拒绝新记录，不删除旧记录。

完整 pytest：`127 passed`，保留 4 条既有依赖/测试写法警告。

## 工具链说明

按 `br-plc-toolchain` 约束尝试使用只读 `plc_probe_target(test_plc_233)`，工具因其运行环境内部仍引用不存在的 `D:` 盘而返回失败；没有执行下载或 PLC 工程操作。随后由采集器自身配置明确的 OPC UA 通道完成连接、测试点写入和读回。PLC 程序没有下载。

## 结论

本轮实机压力测试通过。已经验证的确认边界为：完整数据成功提交到本地 SQLite outbox 后才允许 PLC 触发复位；目标数据库写入异步完成。61 分钟内没有出现“PLC 已确认但 outbox 未记录”、队列卡死、数据库失败丢记录或停机残留。
