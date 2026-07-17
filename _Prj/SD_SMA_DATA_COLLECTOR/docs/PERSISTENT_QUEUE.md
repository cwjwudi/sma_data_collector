# SQLite 持久化采集队列

## 确认语义

启用 `persistent_queue.enabled=true` 后，采集链路顺序为：

```text
PLC 触发 → OPC UA 完整读取 → SQLite 事务提交 → 回调成功 → PLC 触发复位
                                  ↓
                              deque 热缓存
                                  ↓
                         MySQL/目标数据库异步写入
```

SQLite 写入失败、文件达到容量上限、磁盘满或锁等待超时都会让采集回调失败，因此 PLC 触发位不会被确认。目标数据库失败不影响已经完成的 PLC 接收确认，记录会保留在 outbox 中重试。

## 配置

```json
{
  "persistent_queue": {
    "enabled": true,
    "path": "runtime/queue/collector_outbox.db",
    "synchronous": "FULL",
    "busy_timeout_ms": 5000,
    "lease_seconds": 60,
    "retry_interval_seconds": 5,
    "max_retry_interval_seconds": 300,
    "max_attempts": 0,
    "completed_retention_days": 1,
    "cleanup_interval_seconds": 3600,
    "max_queue_rows": 1000000
  }
}
```

- `synchronous=FULL`：默认工业可靠性设置。`NORMAL` 性能更高，但主机断电边界弱于 FULL。
- `max_attempts=0`：无限重试；大于零时超过次数转入 dead-letter。
- `max_queue_rows`：包含 pending、processing、retry 和 dead-letter。达到上限后拒绝新数据，不会删除最旧记录。
- `completed_retention_days`：成功记录的审计保留天数。
- `cleanup_interval_seconds`：运行期间清理过期成功记录的周期，默认 3600 秒；启动和正常停机时也会执行清理。普通 `DELETE` 释放的 SQLite 页面会供后续写入复用，使文件稳定在保留窗口的高水位附近，但不会主动缩小主文件。

运行期清理已使用测试 PLC `192.168.50.233` 和实际 MySQL 完成实机闭环验证，详见 `PERSISTENT_CLEANUP_LIVE_REPORT_20260717.md`。

SQLite 文件、`-wal` 和 `-shm` 文件必须位于本地可靠磁盘，不建议放在网络共享目录。运行账号需要对父目录具有创建和写入权限。备份时应使用 SQLite 在线备份机制，不能只复制主 `.db` 而忽略 WAL。

## 状态与恢复

| 状态 | 含义 |
|---|---|
| `pending` | 已持久化，等待写入目标数据库 |
| `processing` | worker 正在处理；非正常退出后启动时回收为 pending |
| `retry` | 目标数据库失败，按指数退避等待重试 |
| `dead_letter` | 数据不可转换或达到配置的最大重试次数 |
| `completed` | 目标数据库已成功提交或业务唯一键冲突已明确消费 |

运行指标包含 `outbox_*_size`、`outbox_file_bytes`、接受、恢复、重试、完成和 dead-letter 计数。

## 运维命令

在采集器目录运行：

```powershell
python tools/persistent_queue_admin.py runtime/queue/collector_outbox.db stats
python tools/persistent_queue_admin.py runtime/queue/collector_outbox.db list --status dead_letter
python tools/persistent_queue_admin.py runtime/queue/collector_outbox.db export runtime/queue/dead_letter.json
python tools/persistent_queue_admin.py runtime/queue/collector_outbox.db replay-dead-letter
python tools/persistent_queue_admin.py runtime/queue/collector_outbox.db replay-dead-letter --execute
```

重放命令默认只预览，必须显式添加 `--execute`。重放前应先修复数据或目标表问题并导出留档，避免产生重复业务记录。

## 降级行为

未配置或设置 `enabled=false` 时保持旧版 deque 行为，不能抵抗断电和强制终止。旧模式达到内存队列上限会告警并丢弃最旧数据；对可靠性有要求的环境应启用持久化队列。
