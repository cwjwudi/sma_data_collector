# OPC UA 写入问题修复说明

## 问题描述

在使用变量触发数据采集时，系统会尝试将触发点复位为 `False` 值。但在某些OPC UA服务器上会出现以下错误：

```
"The server does not support writing the combination of value, status and timestamps provided."(BadWriteNotSupported)
```

## 问题原因

这个问题通常是由于：
1. OPC UA服务器节点配置为只读
2. 服务器不支持同时写入值、状态和时间戳的组合
3. 触发点节点在服务器端被配置为不可写

## 解决方案

### 1. 改进的错误处理

修改了 `communication/opcua_client.py` 中的 `write_boolean_value` 方法：

- 添加了节点可写性检查
- 实现了优雅的错误处理机制
- 当服务器不支持写入时，系统会记录INFO级别的日志而不是ERROR
- 系统继续正常运行，不影响数据采集功能

### 2. 可配置的触发点复位

新增配置选项 `reset_trigger_after_read`：

```json
{
  "name": "trigger_group_1",
  "trigger": "variable",
  "trigger_point": "bTrigger",
  "reset_trigger_after_read": true  // 默认为true，设为false可禁用复位
}
```

### 3. 日志改进

错误日志现在更加友好：
- 之前：`ERROR - 写入布尔值到 ns=6;s=::OpcCon:bSwitch 失败: "The server does not support..."`
- 之后：`INFO - 服务器不支持写入操作: ns=6;s=::OpcCon:bSwitch，这是正常现象`

## 使用建议

### 方案一：保持默认配置（推荐）

让系统尝试复位触发点，即使失败也不会影响数据采集：

```json
"reset_trigger_after_read": true
```

### 方案二：禁用触发点复位

如果确定不需要复位功能，可以直接禁用：

```json
"reset_trigger_after_read": false
```

### 方案三：使用专门的配置文件

参考 `config/sample_config_no_reset.json` 文件，其中已经配置为禁用触发点复位。

## 测试验证

运行测试脚本验证修复效果：

```bash
python test_opcua_write_fix.py
```

测试会显示：
- ✅ 服务器不支持写入时的正确日志信息
- ✅ 系统继续正常运行
- ✅ 配置选项正常工作

## 注意事项

1. 即使写入失败，数据采集功能仍能正常工作
2. 禁用触发点复位后，需要确保外部系统能正确管理触发点状态
3. 建议根据实际的OPC UA服务器特性选择合适的配置

## 版本变更

- 新增 `reset_trigger_after_read` 配置选项
- 改进了OPC UA写入错误处理
- 优化了相关日志信息
- 保持向后兼容性