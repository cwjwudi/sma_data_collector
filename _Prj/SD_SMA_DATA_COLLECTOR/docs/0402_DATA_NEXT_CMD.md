# OPC UA 批次传输与 bNext 信号控制

## 概述

本文档说明当数据库查询结果超过 OPC UA 缓冲区上限（10,000 条）时，系统如何通过 bNext 握手信号机制实现分批数据传输。

## 核心特性

### 1. 单一布尔信号控制
- **配置简化**：使用单个 `bNext` 布尔变量，而非多个独立信号
- **上升沿检测**：每次 PLC 触发 bNext 从 FALSE 到 TRUE 的跳变，发送下一批数据

### 2. 递减式剩余量反馈
- **反馈逻辑**：`剩余量 = 总数据量 - 已发送量`
- **实时追踪**：PLC 可随时查看还有多少数据待接收

## 配置说明

### sample_config.json 配置

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

**关键字段说明：**
- `buffer_size`: 每个缓冲区的最大容量（默认 10000）
- `cmd_next_nodes`: PLC 下一批请求信号（单个布尔变量）
- `feed_back_nodes`: 反馈节点数组（显示剩余待发送数据量）

## 工作流程

### 完整传输流程示例（25,000 条数据）

| 批次 | 本批发送量 | 累计已发送 | 反馈值（剩余量） | PLC 动作 |
|------|-----------|-----------|----------------|---------|
| 第 1 批 | 10,000 | 10,000 | **15,000** | 读取后触发 bNext↑ |
| 第 2 批 | 10,000 | 20,000 | **5,000** | 读取后触发 bNext↑ |
| 第 3 批 | 5,000 | 25,000 | **0** | 传输完成 |

### 时序图

```
Python 端                              PLC 端
  │                                     │
  ├─ 查询数据库（25,000 条）              │
  │                                     │
  ├─ 写入第 1 批（10,000 条）             │
  ├─ 反馈：15,000（剩余量）──────────────>│读取缓冲区
  │                                     │
  │                              <──────┤设置 bNext = TRUE
  ├─ 检测 bNext↑上升沿                   │
  │                                     │
  ├─ 写入第 2 批（10,000 条）             │
  ├─ 反馈：5,000（剩余量）───────────────>│读取缓冲区
  │                                     │
  │                              <──────┤设置 bNext = TRUE
  ├─ 检测 bNext↑上升沿                   │
  │                                     │
  ├─ 写入第 3 批（5,000 条）              │
  ├─ 反馈：0（传输完成）─────────────────>│读取缓冲区
  │                                     │
  └─ 传输完成                            └─复位 bNext = FALSE
```

## 核心代码逻辑

### 1. 分批传输主函数

```python
async def _write_query_results_batched(self, query_results, query_time, point_names):
    """
    分批写入查询结果到 OPC UA 缓冲区
    
    工作流程：
    1. 计算总数据量和批次数
    2. 写入第一批数据
    3. 写入反馈信息（剩余待发送数据量）
    4. 等待 PLC 的 bNext 上升沿信号
    5. 写入下一批数据，更新反馈值（递减）
    6. 重复步骤 4-5 直到所有数据传输完成
    """
    # 计算每个缓冲区的总数据量
    total_counts_per_buffer = [len(buffer_data) for buffer_data in query_results]
    total_records = sum(total_counts_per_buffer)
    
    # 记录已发送的数据量（用于计算剩余量）
    sent_counts_per_buffer = [0] * len(query_results)
    
    # 逐批传输
    for batch_idx in range(max_batches):
        # 准备当前批次数据
        # 更新已发送量：sent_counts += 本批实际发送量
        # 写入数据和反馈（剩余量 = 总量 - 已发送量）
        # 等待 bNext 上升沿（除了最后一批）
```

### 2. 反馈值计算

```python
async def _write_batch_to_buffers(self, ..., total_counts, sent_counts):
    """
    写入单批数据到缓冲区，并更新反馈值
    
    Args:
        total_counts: 每个缓冲区的总数据量
        sent_counts: 每个缓冲区已发送的数据量
    """
    for i, feed_back_node in enumerate(self.feed_back_nodes):
        if i < len(total_counts):
            # 剩余量 = 总量 - 已发送量
            remaining_count = total_counts[i] - sent_counts[i]
            
            # 计算本次发送的数据量
            current_batch_send_count = sent_counts[i] - (current_batch) * self.buffer_size
            if current_batch_send_count < 0:
                current_batch_send_count = 0
            
            # feed_back_count = 本次发送的数据量 + 剩余需要发送的数据量
            fead_back_count = current_batch_send_count + remaining_count
            
            # 写入反馈值
            success = await self._write_to_node(feed_back_node, [fead_back_count], ua.VariantType.UInt32)
```

### 3. bNext 信号检测

```python
async def _wait_for_plc_next_signal(self, current_batch, timeout=30.0):
    """
    等待 PLC 的 bNext 上升沿信号（单一布尔信号版本）
    
    检测逻辑：
    1. 读取 bNext 初始状态
    2. 循环轮询（每 100ms 一次）
    3. 检测从 FALSE 到 TRUE 的跳变
    4. 检测到上升沿后立即返回
    """
    # 读取 bNext 信号初始状态
    node = self.opcua_client.client.get_node(self.cmd_next_nodes[0])
    initial_value = node.get_value()
    previous_state = bool(initial_value) if initial_value is not None else False
    
    # 循环检测上升沿
    while True:
        # 检查超时
        # 读取 bNext 当前状态
        current_value = node.get_value()
        current_state = bool(current_value) if current_value is not None else False
        
        # 检测上升沿：从 False 变为 True
        if not previous_state and current_state:
            self.logger.info(f"检测到 bNext 上升沿信号 (批次 {current_batch + 1})")
            return True
        
        # 更新状态
        previous_state = current_state
        
        # 等待 100ms 后再次检测
        await asyncio.sleep(0.1)
```

## PLC 程序配合要求

### 数据结构定义

```structured-text
TYPE ST_DbReadQuery_Cmd :
STRUCT
    bNext : BOOL;  (* 下一批请求信号 - 上升沿触发 *)
    // ... 其他字段
END_STRUCT
END_TYPE

TYPE ST_DbReadQuery_Rev :
STRUCT
    udiRevFeedBack : UDINT;  (* 反馈值：剩余待发送数据量 *)
    rRevBuffer : ARRAY[0..9999] OF REAL;  (* 数据缓冲区 *)
    udiRevTime : ARRAY[0..9999] OF UDINT;  (* 时间缓冲区 *)
    // ... 其他字段
END_STRUCT
END_TYPE
```

### PLC 程序逻辑示例

```structured-text
PROGRAM Main
VAR
    fbDbReadQuery : ST_DbReadQuery;
    bNext_Prev : BOOL := FALSE;
    dataReceived : BOOL := FALSE;
END_VAR

(* 检测查询完成标志 *)
IF fbDbReadQuery.bQueryDone THEN
    (* 读取缓冲区数据 *)
    FOR i := 0 TO fbDbReadQuery.udiRevFeedBack - 1 DO
        processData(fbDbReadQuery.rRevBuffer[i]);
    END_FOR;
    
    (* 如果还有剩余数据，触发下一批 *)
    IF fbDbReadQuery.udiRevFeedBack > 0 THEN
        bNext_Prev := FALSE;
    END_IF;
END_IF;

(* bNext 上升沿生成逻辑 *)
IF NOT bNext_Prev AND NOT dataReceived THEN
    fbDbReadQuery.bNext := TRUE;  (* 触发上升沿 *)
    bNext_Prev := TRUE;
ELSE
    fbDbReadQuery.bNext := FALSE;
END_IF;

(* 数据传输完成标志 *)
IF fbDbReadQuery.udiRevFeedBack = 0 THEN
    dataReceived := TRUE;
END_IF;
```

## 日志输出示例

### 正常传输日志

```log
2026-04-02 14:30:00,123 - communication.opcua_data_writer - INFO - 需要分批传输，总计 25000 条记录，最大批次数：3
2026-04-02 14:30:00,125 - communication.opcua_data_writer - INFO - 开始传输第 1/3 批数据
2026-04-02 14:30:00,234 - communication.opcua_data_writer - INFO - 批次 1/3 - 成功写入缓冲区 1: ns=6;s=::DataRev:stDbReadQuery.stRev[0].rRevBuffer, 本批实际数据量=10000
2026-04-02 14:30:00,245 - communication.opcua_data_writer - INFO - 批次 1/3 - 成功写入反馈 1: ns=6;s=::DataRev:stDbReadQuery.stRev[0].udiRevFeedBack, 总量=25000, 已发送=10000, 剩余=15000
2026-04-02 14:30:00,246 - communication.opcua_data_writer - INFO - 批次 1/3 - 写入完成，剩余待发送：15000
2026-04-02 14:30:00,247 - communication.opcua_data_writer - INFO - 等待 PLC 确认信号 (bNext)，准备传输下一批...
2026-04-02 14:30:01,358 - communication.opcua_data_writer - INFO - 检测到 bNext 上升沿信号 (批次 2)
2026-04-02 14:30:01,359 - communication.opcua_data_writer - INFO - PLC 确认信号已收到，继续传输下一批
2026-04-02 14:30:01,467 - communication.opcua_data_writer - INFO - 开始传输第 2/3 批数据
2026-04-02 14:30:01,578 - communication.opcua_data_writer - INFO - 批次 2/3 - 成功写入缓冲区 1, 本批实际数据量=10000
2026-04-02 14:30:01,589 - communication.opcua_data_writer - INFO - 批次 2/3 - 成功写入反馈 1, 总量=25000, 已发送=20000, 剩余=5000
2026-04-02 14:30:02,701 - communication.opcua_data_writer - INFO - 检测到 bNext 上升沿信号 (批次 3)
2026-04-02 14:30:02,812 - communication.opcua_data_writer - INFO - 开始传输第 3/3 批数据
2026-04-02 14:30:02,923 - communication.opcua_data_writer - INFO - 批次 3/3 - 成功写入缓冲区 1, 本批实际数据量=5000
2026-04-02 14:30:02,934 - communication.opcua_data_writer - INFO - 批次 3/3 - 成功写入反馈 1, 总量=25000, 已发送=25000, 剩余=0
2026-04-02 14:30:02,935 - communication.opcua_data_writer - INFO - 所有 3 批数据传输完成
```

### 异常处理日志

```log
# 超时错误
2026-04-02 14:35:00,123 - communication.opcua_data_writer - ERROR - 等待 PLC 信号超时 (30 秒)
2026-04-02 14:35:00,124 - communication.opcua_data_writer - ERROR - 第 2 批数据传输失败

# 连接错误
2026-04-02 14:40:00,567 - communication.opcua_data_writer - ERROR - OPC UA 客户端未连接，无法写入数据
2026-04-02 14:40:00,568 - communication.opcua_data_writer - ERROR - 写入单批数据失败：Connection lost
```

## 性能优化

### 通信效率对比

| 方案 | 信号数量 | 每次轮询次数 | 响应时间 | 适用场景 |
|------|---------|------------|---------|---------|
| 多信号轮询 | 10 个 | 10 次 OPC UA 读取 | ~50-100ms | 不推荐 |
| **单一信号** | **1 个** | **1 次 OPC UA 读取** | **~5-10ms** | **✅ 推荐** |

### 优化要点

1. **减少通信次数**：从 10 次读取减少到 1 次
2. **简化逻辑**：单一信号检测 vs 多信号轮询
3. **精确实时反馈**：递减式剩余量显示
4. **超时保护**：30 秒超时机制，防止死锁

## 常见问题 FAQ

### Q1: 为什么反馈值不是简单的剩余量？

**A:** 当前实现的反馈值 = 本次发送量 + 剩余量，这样设计是为了：
- PLC 可以知道当前缓冲区有多少有效数据
- 同时了解还有多少数据待接收
- 便于 PLC 进行缓冲区管理和数据处理

### Q2: 如何调整超时时间？

**A:** 修改 `_wait_for_plc_next_signal()` 函数的 `timeout` 参数：
```python
plc_ready = await self._wait_for_plc_next_signal(batch_idx, timeout=60.0)  # 改为 60 秒
```

### Q3: 如果数据量正好是 10000 的整数倍，如何处理？

**A:** 系统会自动计算正确的批次数。例如 20000 条数据会分为 2 批：
- 第 1 批：10000 条，反馈 10000
- 第 2 批：10000 条，反馈 0

### Q4: bNext 信号需要 PLC 手动复位吗？

**A:** 是的。PLC 程序应该在：
1. 检测到 bNext=TRUE 后开始读取数据
2. 读取完成后立即将 bNext 复位为 FALSE
3. 下次需要数据时再次置为 TRUE（产生上升沿）

## 相关文件

- `communication/opcua_data_writer.py` - 核心实现
- `config/sample_config.json` - 配置示例
- `core/config_models.py` - 配置模型定义

## 版本历史

- **v1.1.0** (2026-04-02): 实现单一 bNext 信号控制和递减式反馈机制
- **v1.0.0**: 初始版本，使用多信号轮询机制