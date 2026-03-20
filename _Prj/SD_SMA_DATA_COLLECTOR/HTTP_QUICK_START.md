# HTTP 数据监控快速启动指南

## 📋 概述

本系统支持将 OPC UA 采集的数据通过 HTTP 服务实时发送到前端页面进行监控。

## 🚀 快速启动

### 方式一：使用启动脚本（推荐）

1. **双击运行** `start_http.bat`
   - 自动启动 HTTP 测试服务器
   - 自动启动数据采集系统
   - 显示访问地址

2. **访问监控页面**
   - 打开浏览器访问：`http://localhost:8080/`
   - 可选择以下两个页面：
     - **新版监控页面**：`docs/line_http.html.js`（功能全面）
     - **旧版图表页面**：`js/line_http.html`（ECharts 图表）

### 方式二：手动启动

#### 1. 启动 HTTP 测试服务器
```bash
python tests\test_http_server.py
```

#### 2. 启动数据采集系统
```bash
python main.py --config config\trend_config.json
```

#### 3. 访问监控页面
在浏览器中打开：
- **新版监控页面**：直接打开 `docs/line_http.html.js` 文件
- **旧版图表页面**：直接打开 `js/line_http.html` 文件

或者使用 Python 内置服务器：
```bash
# 新版页面
cd docs
python -m http.server 8080

# 旧版页面
cd js
python -m http.server 8081
```

## 📁 文件说明

### 配置文件
- `config/trend_config.json` - 简化配置文件，包含 Trenddata 数据组
- `config/Alarm_Audit.json` - 完整配置文件
- `config/sample_config.json` - 示例配置文件

### 核心文件
- `main.py` - 主程序入口
- `communication/http_client.py` - HTTP 客户端
- `communication/opcua_data_writer.py` - 数据写入器（支持双通道输出）
- `tests/test_http_server.py` - HTTP 测试服务器

### 前端页面
- `docs/line_http.html.js` - 新版监控页面（卡片式布局）
- `js/line_http.html` - 旧版图表页面（ECharts 折线图）

## ⚙️ 配置说明

### 启用 HTTP 功能

在配置文件中添加或修改 `http_server` 部分：

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

### 数据流程

```
OPC UA 服务器
    ↓
数据采集系统 (main.py)
    ↓
├─→ OPC UA 缓冲区 (原有功能)
└─→ HTTP 客户端 (新增功能)
        ↓
    HTTP 服务器 (test_http_server.py)
        ↓
    前端监控页面 (line_http.html.js)
```

## 🔍 API 接口

### POST /api/data
接收数据采集系统发送的数据

**请求格式：**
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "group_name": "query_group_1",
  "point_names": ["Trenddata", "strStartTimes"],
  "data_count": 2,
  "buffers": [
    {
      "buffer_index": 0,
      "values": [1.23, 4.56, 7.89],
      "times": ["2024-01-01T00:00:00Z", ...],
      "total_count": 100
    }
  ]
}
```

### GET /api/latest-data
获取最新的数据

**响应格式：**
```json
{
  "status": "success",
  "data": {
    "timestamp": "2024-01-01T00:00:00Z",
    "group_name": "query_group_1",
    "point_names": ["Trenddata", "strStartTimes"],
    "data_count": 2,
    "buffers": [...]
  }
}
```

### GET /
返回前端监控页面（index.html）

## 🛠️ 故障排查

### 问题 1：前端显示"连接失败"

**原因：**
- HTTP 服务器未启动
- 访问地址错误

**解决方法：**
1. 确保 `test_http_server.py` 正在运行
2. 检查前端页面的连接地址是否为 `http://localhost:8080/api/latest-data`
3. 查看控制台日志是否有错误信息

### 问题 2：数据采集系统没有发送 HTTP 数据

**原因：**
- 配置文件中未启用 HTTP 功能
- HTTP 客户端初始化失败

**解决方法：**
1. 检查配置文件中 `http_server.enabled` 是否为 `true`
2. 查看启动日志中是否有 HTTP 客户端初始化信息
3. 检查 `aiohttp` 库是否已安装：`pip install aiohttp`

### 问题 3：收不到 OPC UA 数据

**原因：**
- OPC UA 服务器未连接
- 数据点地址配置错误

**解决方法：**
1. 确保 PLC 中的 OPC UA 服务器已启动
2. 检查配置文件中数据点的 `path` 是否正确
3. 查看日志中的 OPC UA 连接状态

## 📊 页面选择

### 新版监控页面 (`docs/line_http.html.js`)
**特点：**
- 卡片式布局，清晰展示每个缓冲区
- 实时日志显示
- 支持多个数据组
- 现代化 UI 设计

**适用场景：**
- 需要监控多个数据组
- 需要查看详细日志
- 偏好简洁清晰的界面

### 旧版图表页面 (`js/line_http.html`)
**特点：**
- ECharts 折线图可视化
- 时间序列数据展示
- 自动刷新
- 专业图表效果

**适用场景：**
- 关注单个数据组的趋势
- 需要历史数据对比
- 偏好图表可视化

## 🔧 自定义配置

### 修改 HTTP 服务器地址

编辑 `config/trend_config.json`：
```json
{
  "http_server": {
    "enabled": true,
    "base_url": "http://your-server-ip:port",
    "endpoint": "/api/data"
  }
}
```

### 修改前端轮询间隔

编辑 `docs/line_http.html.js` 第 115 行：
```javascript
const POLL_INTERVAL = 2000; // 单位：毫秒
```

### 修改 HTTP 重试次数

编辑 `config/trend_config.json`：
```json
{
  "http_server": {
    "max_retries": 5,      // 最大重试次数
    "retry_delay": 2.0     // 重试间隔（秒）
  }
}
```

## 📝 注意事项

1. **端口占用**：确保 8080 端口未被其他程序占用
2. **防火墙**：如果远程访问，需要开放相应端口
3. **性能考虑**：轮询间隔不宜过短，建议 2 秒以上
4. **数据安全**：生产环境建议添加认证机制

## 🎯 下一步

1. 根据实际需求修改配置文件
2. 启动系统并观察数据流
3. 在前端页面查看实时数据
4. 根据需要调整轮询间隔和显示效果

## 📞 技术支持

如有问题，请查看：
- 系统日志：`logs/` 目录
- 控制台输出
- 浏览器开发者工具（F12）
