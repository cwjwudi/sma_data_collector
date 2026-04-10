# HTTP 数据发送功能说明

## 功能概述

数据采集系统现在支持将查询结果同时发送到：
1. **OPC UA 服务器**（原有功能，已保留）
2. **HTTP 服务器**（新增功能）

## 配置方式

### 1. 在配置文件中添加 HTTP 服务器设置

编辑配置文件（如 `config/Alarm_Audit.json`），添加以下配置：

```json
{
  "http_server": {
    "enabled": true,
    "base_url": "http://localhost:8080",
    "endpoint": "/api/data",
    "timeout": 30,
    "max_retries": 3,
    "retry_delay": 1.0
  }
}
```

**配置参数说明：**
- `enabled`: 是否启用 HTTP 发送功能（true/false）
- `base_url`: HTTP 服务器地址
- `endpoint`: API 端点路径
- `timeout`: 请求超时时间（秒）
- `max_retries`: 失败后最大重试次数
- `retry_delay`: 重试间隔（秒）

### 2. OPC UA 写入配置（保持不变）

原有的 OPC UA 缓冲区配置保持不变：

```json
{
  "groups": [
    {
      "name": "query_group_1",
      "trigger": "query",
      "query_config": {
        "buffer_nodes": [...],
        "time_nodes": [...],
        "buffer_size": 10000
      }
    }
  ]
}
```

## 工作流程

当查询任务触发时，系统会：

1. **从数据库查询数据**
2. **写入 OPC UA 缓冲区**（原有功能）
3. **发送到 HTTP 服务器**（新增功能）

两个写入操作是**并行**的，互不影响。如果 HTTP 发送失败，不会影响 OPC UA 写入。

## 发送的数据格式

发送到 HTTP 服务器的数据结构如下：

```json
{
  "timestamp": "2024-01-01T12:00:00.000000",
  "group_name": "query_group_1",
  "point_names": ["rEC", "rF10", "rF11"],
  "data_count": 3,
  "buffers": [
    {
      "buffer_index": 0,
      "values": [1.5, 2.3, 3.7, ...],  // 前 100 个值
      "times": ["2024-01-01T12:00:00", ...],
      "total_count": 1000
    },
    {
      "buffer_index": 1,
      "values": [...],
      "times": [...],
      "total_count": 1000
    }
  ]
}
```

## 测试方法

### 1. 启动测试用 HTTP 服务器

```bash
python tests/test_http_server.py
```

这会启动一个简易的 HTTP 服务器，监听在 `http://localhost:8080`

### 2. 访问监控页面

打开浏览器访问：`http://localhost:8080`

可以看到实时数据监控页面。

### 3. 启动数据采集系统

```bash
python main.py --config config/sample_config.json
```

### 4. 触发查询任务

通过 OPC UA 设置 `bTriggerQuery` 为 `True`，系统会：
- 读取查询参数
- 执行数据库查询
- 写入 OPC UA 缓冲区
- 发送到 HTTP 服务器

## 前端集成

### 使用提供的监控页面

`docs/line_http.html.js` 是一个完整的 HTML + JavaScript 监控页面，支持：

- 实时数据显示
- 缓冲区数据可视化
- 日志记录
- 状态监控

### 自定义前端

你可以通过以下方式集成到自己的系统：

#### 方式 1：WebSocket 推送（推荐）
修改 `test_http_server.py`，添加 WebSocket 支持：

```python
from aiohttp import web, WSMsgType

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # 保存 WebSocket 引用到全局变量
    # 当收到数据时，推送到所有连接的客户端
    
    return ws
```

#### 方式 2：HTTP 轮询
前端定期请求 `/api/latest-data` 获取最新数据：

```javascript
setInterval(async () => {
    const response = await fetch('http://localhost:8080/api/latest-data');
    const data = await response.json();
    handleDataReceived(data);
}, 2000);
```

#### 方式 3：Server-Sent Events (SSE)
使用 SSE 实现服务器推送：

```python
async def sse_handler(request):
    from aiohttp_sse import sse_response
    
    async with sse_response(request) as resp:
        while True:
            # 等待新数据并发送
            await resp.send(json.dumps(data))
    
    return resp
```

## 日志查看

系统会在日志中记录 HTTP 发送状态：

```
2024-01-01 12:00:00 - INFO - 准备发送数据到 HTTP 服务器...
2024-01-01 12:00:01 - INFO - 数据成功发送到 HTTP 服务器：http://localhost:8080/api/data
2024-01-01 12:00:01 - INFO - 成功发送数据到 HTTP 服务器，共 3 个缓冲区
```

如果发送失败：

```
2024-01-01 12:00:00 - WARNING - HTTP 服务器返回异常状态码：500
2024-01-01 12:00:01 - INFO - 等待 1.0 秒后重试...
2024-01-01 12:00:02 - ERROR - 发送数据失败，已达到最大重试次数
```

## 禁用 HTTP 功能

如果想临时禁用 HTTP 发送，只需在配置文件中设置：

```json
{
  "http_server": {
    "enabled": false
  }
}
```

或者删除整个 `http_server` 配置段。

## 注意事项

1. **性能考虑**：HTTP 发送是异步的，不会阻塞主流程
2. **重试机制**：发送失败会自动重试，最多 3 次
3. **数据量控制**：每个缓冲区只发送前 100 个值，避免数据量过大
4. **连接管理**：系统启动时创建 HTTP 连接，停止时自动关闭
5. **向后兼容**：原有 OPC UA 功能完全保留，不受影响

## 故障排除

### 问题 1：HTTP 服务器无法连接

**检查：**
- HTTP 服务器是否已启动
- 防火墙是否阻止连接
- `base_url` 配置是否正确

### 问题 2：数据发送失败

**查看日志：**
```bash
tail -f data_collector.log | grep HTTP
```

**可能原因：**
- HTTP 服务器返回非 200 状态码
- JSON 格式错误
- 网络超时

### 问题 3：前端收不到数据

**检查：**
- HTTP 服务器日志
- 浏览器开发者工具的网络面板
- CORS 配置（如果有跨域问题）

## 扩展功能

### 添加认证

在 HTTP 客户端中添加认证头：

```python
http_client = HttpClient(
    base_url='http://localhost:8080',
    headers={'Authorization': 'Bearer YOUR_TOKEN'}
)
```

### 自定义数据格式

修改 `OpcUaDataWriter._send_to_http_server()` 方法，自定义发送的数据结构。

### 多服务器发送

可以创建多个 HTTP 客户端，同时发送到多个服务器。
