# 数据类型（datatype）功能说明

## 概述

本系统支持在配置文件中为数据点指定 `datatype` 属性，用于控制数据写入数据库时的类型转换行为。特别适用于需要将字符串转换为 datetime 等特定类型的场景。

## 功能特性

### 1. 可选的 datatype 属性

- `datatype` 是**可选属性**，如果不指定，系统将按默认方式处理数据
- 如果指定了 `datatype`，系统会在写入数据库前进行相应的类型转换

### 2. 支持的类型

目前支持以下数据类型：

| 类型值 | 说明 | 示例 |
|--------|------|------|
| `datetime` | 日期时间类型 | `"2024-01-15 10:30:45"` → `datetime` 对象 |
| `int` / `integer` | 整数类型 | `"123"` → `123` |
| `float` / `double` / `real` | 浮点数类型 | `"3.14"` → `3.14` |
| `str` / `string` / `varchar` / `text` | 字符串类型 | 任何值 → 字符串 |
| `bool` / `boolean` | 布尔类型 | `"true"` → `True` |

### 4. 类型映射表（datatype → 数据库类型）

| datatype 配置值 | 数据库列类型 | 说明 |
|----------------|-------------|------|
| `datetime` | `DATETIME` | 原生日期时间类型 |
| `int` / `integer` | `INTEGER` | 整数类型 |
| `float` / `double` / `real` | `DOUBLE` | 浮点数类型 |
| `str` / `string` / `varchar` / `text` | `VARCHAR(255)` | 字符串类型 |
| `bool` / `boolean` | `BOOLEAN` | 布尔类型 |
| (未配置) | `VARCHAR(255)` | 基于值推断为字符串 |

**⚠️ 重要**: 如果没有配置 `datatype`，系统会基于值推断类型。如果值是字符串类型，会被推断为 `VARCHAR(255)`。因此，**强烈建议**对需要特殊类型的字段（如时间字段）明确指定 `datatype`。

### 3. datetime 类型特别说明

当 `datatype` 设置为 `"datetime"` 时：

- ✅ **必须**将字符串值解析并转换为数据库原生的 datetime 类型后写入
- ❌ **禁止**以字符串形式直接存储
- 系统支持多种常见的时间格式自动识别：
  - `%Y-%m-%d %H:%M:%S` (例如: `2024-01-15 10:30:45`)
  - `%Y-%m-%d %H:%M:%S.%f` (例如: `2024-01-15 10:30:45.123456`)
  - `%Y-%m-%dT%H:%M:%S` (例如: `2024-01-15T10:30:45`)
  - `%Y-%m-%dT%H:%M:%S.%f` (例如: `2024-01-15T10:30:45.123456`)
  - `%Y-%m-%dT%H:%M:%SZ` (例如: `2024-01-15T10:30:45Z`)
  - `%Y/%m/%d %H:%M:%S` (例如: `2024/01/15 10:30:45`)
  - `%Y%m%d%H%M%S` (例如: `20240115103045`)
  - `DT#%Y-%m-%d-%H:%M:%S` (例如`DT#2022-03-19-17:41:48`)

## 配置示例

### 基本用法

在配置文件（如 `Alarm_trend.json`）的 `points` 数组中添加 `datatype` 属性：

```json
{
  "points": [
    {
      "name": "ts",
      "path": "ns=6;s=::AlarmQuerr:ts",
      "description": "报警时间戳",
      "datatype": "datetime"
    },
    {
      "name": "code",
      "path": "ns=6;s=::AlarmQuerr:Code",
      "description": "报警码"
    },
    {
      "name": "value",
      "path": "ns=6;s=::Sensor:value",
      "description": "传感器数值",
      "datatype": "float"
    }
  ]
}
```

### 完整示例

参考 `config/Alarm_trend.json` 文件中的配置：

```json
{
  "points": [
    {
      "name": "ts",
      "path": "ns=6;s=::AlarmQuerr:ts",
      "description": "报警时间戳",
      "datatype": "datetime"
    },
    {
      "name": "code",
      "path": "ns=6;s=::AlarmQuerr:Code",
      "description": "报警码"
    },
    {
      "name": "msg",
      "path": "ns=6;s=::AlarmQuerr:msg",
      "description": "报警信息"
    }
  ]
}
```

## 实现细节

### 数据流

1. **配置加载** (`config_loader.py`)
   - 解析 JSON 配置文件
   - 读取每个数据点的 `datatype` 属性（如果存在）
   - 创建 `DataPoint` 对象，保存 `datatype` 信息

2. **数据采集** (`data_collector.py`)
   - 从 OPC UA 服务器读取数据
   - 数据保持原始格式（通常是字符串）

3. **表结构推断** (`data_storage.py`)
   - **⚠️ 重要**: `_infer_column_types()` 方法会**优先使用配置中的 `datatype`** 来确定数据库表列类型
   - 如果没有配置 `datatype`，则回退到基于值推断
   - 例如：如果配置了 `datatype: "datetime"`，数据库列类型会是 `DATETIME`
   - 例如：如果没有配置，字符串值会被推断为 `VARCHAR(255)`

4. **数据类型转换** (`data_storage.py`)
   - `_convert_to_db_format()` 方法检查数据点是否有 `datatype` 配置
   - 如果有，调用 `_convert_value_by_datatype()` 进行类型转换
   - 对于 `datetime` 类型，尝试多种格式解析字符串

5. **数据库表创建** (`db_manager.py`)
   - 使用推断出的列类型创建表
   - SQLAlchemy 会自动处理 Python datetime 对象到数据库 DATETIME 类型的映射

### 关键代码位置

- **数据模型**: `core/config_models.py` - `DataPoint` 类
- **配置加载**: `core/config_loader.py` - `_parse_config()` 方法
- **列类型推断**: `database/data_storage.py` - `_infer_column_types()` 方法
- **类型转换**: `database/data_storage.py` - `_convert_value_by_datatype()` 方法
- **主程序集成**: `main.py` - 初始化时传递 `points_dict` 给 `DataStorageProcessor`

## 错误处理

### 类型转换失败

如果类型转换失败，系统会：

1. 记录警告日志，包含以下信息：
   - 原始值
   - 目标类型
   - 数据点名称
2. 返回原始值（不进行转换）
3. 继续处理其他数据

示例日志：
```
WARNING - 无法将 'invalid-date' 解析为 datetime (point: ts)，使用原始值
```

### 未知类型

如果指定了不支持的 `datatype` 值：

1. 记录调试日志
2. 使用原始值（不转换）

## 测试

运行测试脚本验证功能：

```bash
cd SD_SMA_DATA_COLLECTOR
python tests/test_datatype.py
```

测试内容包括：
- ✅ 配置文件 datatype 解析
- ✅ datetime 类型转换（多种格式）
- ✅ **列类型推断**（基于 datatype 配置）
- ✅ 其他类型转换（int, float, string, bool）

## 向后兼容性

- ✅ `datatype` 是可选属性，不影响现有配置
- ✅ 未指定 `datatype` 的数据点按原有逻辑处理
- ✅ 现有配置文件无需修改即可继续使用

## 最佳实践

1. **明确指定类型**: 对于时间字段，始终设置 `datatype: "datetime"`
2. **统一时间格式**: 尽量在 PLC 端使用标准时间格式（如 `YYYY-MM-DD HH:MM:SS`）
3. **验证数据**: 在生产环境使用前，先用测试数据验证转换是否正确
4. **监控日志**: 关注类型转换相关的警告日志，及时发现数据问题

## 常见问题

### Q: 如果 PLC 发送的已经是 datetime 对象怎么办？

A: 系统会检测到值已经是 `datetime` 类型，直接返回，不会重复转换。

### Q: 可以自定义时间格式吗？

A: 当前版本支持常见的 7 种时间格式。如果需要支持其他格式，可以修改 `data_storage.py` 中的 `datetime_formats` 列表。

### Q: datatype 会影响数据库表结构吗？

A: **会的！** 配置中的 `datatype` 会影响两方面的行为：
1. **表结构创建**: `_infer_column_types()` 方法会优先使用配置的 `datatype` 来确定数据库列类型
   - 例如：`datatype: "datetime"` → 列类型为 `DATETIME`
   - 例如：`datatype: "float"` → 列类型为 `DOUBLE`
2. **数据转换**: `_convert_value_by_datatype()` 方法会在写入前将字符串转换为对应的 Python 类型

### Q: 如何为已有数据点添加 datatype？

A: 只需在配置文件的对应数据点中添加 `"datatype": "类型"` 即可。但是需要注意：
- 如果表已存在，需要删除旧表或手动修改表结构
- 新的 `datatype` 配置会影响表结构的创建

### Q: 如果已有表，想要添加新的 datatype 字段怎么办？

A: 有两种方案：
1. **删除旧表**: 系统会自动根据新的 datatype 创建表
2. **手动修改**: 在数据库中手动 ALTER TABLE 添加新列并设置正确的类型

## 版本历史

- **v1.0** (2024-04-08): 初始版本，支持 datetime、int、float、string、bool 类型
