# 更新日志

本文档记录 SMA 数据采集系统的所有重要更新和变更。

## [未发布] - 2026-03-26

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

## [未发布] - 2026-03-25

### [v1.0.0] - 初始版本
- 多控制器支持
- 灵活配置系统
- 多种触发模式（时间/变量/查询）
- 双数据库支持（MySQL/SQLite）
- HTTP 数据推送功能
- 查询回写功能
