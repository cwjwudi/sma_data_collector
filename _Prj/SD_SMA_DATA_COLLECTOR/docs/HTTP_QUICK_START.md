# HTTP 数据发送功能 - 快速开始

## 🚀 快速开始（5 分钟）

### 步骤 1：安装依赖

```bash
pip install aiohttp==3.9.1
```

或直接更新所有依赖：

```bash
pip install -r requirements.txt
```

### 步骤 2：配置系统

编辑 `config/Alarm_Audit.json`，确保包含 `http_server` 配置：

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

### 步骤 3：启动测试服务器（可选）

如果想测试 HTTP 接收功能，先启动测试服务器：

```bash
python tests/test_http_server.py
```

然后打开浏览器访问：http://localhost:8080

### 步骤 4：启动数据采集系统

```bash
python main.py --config config/Alarm_Audit.json
```

### 步骤 5：触发查询

通过 OPC UA 设置 `bTriggerQuery = True`，系统会自动：
1. ✅ 查询数据库
2. ✅ 写入 OPC UA 缓冲区
3. ✅ 发送到 HTTP 服务器

## 📝 关键代码位置

### 1. 数据发送位置（main.py 第 329-331 行）

```python
opcua_client = query_task['opcua_client']
data_writer = OpcUaDataWriter(opcua_client, query_group_config, self.http_client)
# ↓ 在这里同时写入 OPCUA 和发送到 HTTP 服务器
success = await data_writer.write_query_results(...)
```

### 2. HTTP 客户端实现（communication/http_client.py）

```python
class HttpClient:
    async def send_data(self, data: Dict[str, Any]) -> bool:
        # 发送 POST 请求到 HTTP 服务器
        # 支持自动重试
```

### 3. 数据写入器（communication/opcua_data_writer.py）

```python
async def write_query_results(self, query_results, query_time, point_names):
    # 1. 写入 OPCUA 缓冲区（原有功能）
    opcua_success = await self._write_to_opcua_buffers(...)
    
    # 2. 发送到 HTTP 服务器（新增功能）
    if self.http_client:
        http_success = await self._send_to_http_server(...)
    
    return opcua_success
```

## 🔧 配置说明

### 启用/禁用 HTTP 功能

**启用：**
```json
{
  "http_server": {
    "enabled": true,
    "base_url": "http://localhost:8080"
  }
}
```

**禁用：**
```json
{
  "http_server": {
    "enabled": false
  }
}
```

或者直接删除整个 `http_server` 段。

### 修改 HTTP 服务器地址

```json
{
  "http_server": {
    "base_url": "http://192.168.1.100:3000",
    "endpoint": "/api/v1/data"
  }
}
```

## 📊 前端集成示例

### 最简单的接收端点（Node.js + Express）

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/data', (req, res) => {
    const data = req.body;
    console.log('收到数据:', data);
    
    // TODO: 处理数据（存储、转发等）
    
    res.json({ status: 'ok' });
});

app.listen(8080, () => {
    console.log('HTTP 服务器已启动：http://localhost:8080');
});
```

### Python Flask 示例

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/data', methods=['POST'])
def receive_data():
    data = request.json
    print(f'收到数据：{data}')
    
    # TODO: 处理数据
    
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

## 🐛 常见问题

### Q1: 如何确认数据已发送？

**A:** 查看日志文件 `data_collector.log`：

```
INFO - 准备发送数据到 HTTP 服务器...
INFO - 数据成功发送到 HTTP 服务器：http://localhost:8080/api/data
INFO - 成功发送数据到 HTTP 服务器，共 3 个缓冲区
```

### Q2: HTTP 服务器没收到数据？

**A:** 检查以下几点：
1. 配置文件中 `enabled` 是否为 `true`
2. `base_url` 是否正确
3. HTTP 服务器是否已启动
4. 防火墙是否允许连接
5. 查看错误日志

### Q3: 影响原有 OPC UA 功能吗？

**A:** 不影响！两个功能是独立的：
- OPC UA 写入正常进行
- HTTP 发送是额外的功能
- 即使 HTTP 发送失败，也不影响 OPC UA

### Q4: 可以只使用 OPC UA，不使用 HTTP 吗？

**A:** 可以！只需在配置中设置：

```json
{
  "http_server": {
    "enabled": false
  }
}
```

## 📈 进阶用法

### 自定义发送的数据格式

编辑 `communication/opcua_data_writer.py` 的 `_send_to_http_server` 方法：

```python
async def _send_to_http_server(self, query_results, query_time, point_names):
    # 自定义数据结构
    http_data = {
        'custom_field': 'my_value',
        'my_data': [...],
        # ... 你的自定义字段
    }
    
    success = await self.http_client.send_data(http_data)
    return success
```

### 发送到多个服务器

创建多个 HTTP 客户端：

```python
# 在 main.py 的 initialize 方法中
self.http_clients = [
    HttpClient('http://server1.com/api/data'),
    HttpClient('http://server2.com/api/data'),
]

# 在 _process_query_tasks 中
for client in self.http_clients:
    data_writer = OpcUaDataWriter(opcua_client, query_group_config, client)
    # ...
```

### 添加认证头

```python
http_client = HttpClient(
    base_url='http://localhost:8080',
    headers={
        'Authorization': 'Bearer YOUR_TOKEN',
        'X-API-Key': 'YOUR_API_KEY'
    }
)
```

## 🎯 下一步

- 查看完整文档：`docs/HTTP_SERVER_GUIDE.md`
- 查看监控页面：`docs/line_http.html.js`
- 测试服务器代码：`tests/test_http_server.py`

## 💡 提示

- HTTP 发送是**异步**的，不会阻塞主流程
- 支持**自动重试**（最多 3 次）
- 建议在生产环境使用前先充分测试
- 可以根据业务需求自定义数据格式
