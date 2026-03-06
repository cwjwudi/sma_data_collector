# BR数据采集系统

一个基于Python的工业数据采集系统，支持OPC UA协议通信，具备MySQL和SQLite数据库存储能力。

## 功能特性

- ✅ **多协议支持**: 主要支持OPC UA协议，易于扩展其他协议
- ✅ **灵活配置**: 通过JSON文件配置数据点、数据组和数据库参数
- ✅ **双触发模式**: 支持时间间隔触发和变量触发两种采集方式
- ✅ **多数据库支持**: 支持MySQL和SQLite数据库
- ✅ **智能分表**: 按时间自动分表，避免单表过大
- ✅ **批量写入**: 支持批量数据插入，提高写入效率
- ✅ **数据查询**: 支持历史数据查询和CSV导出
- ✅ **松耦合设计**: 通信模块与数据库模块解耦

## 系统架构

```
br_data_collector/
├── config/              # 配置文件目录
│   └── sample_config.json
├── core/               # 核心模块
│   ├── config_models.py   # 配置数据模型
│   └── config_loader.py   # 配置加载器
├── communication/      # 通信模块
│   ├── opcua_client.py    # OPC UA客户端
│   └── data_collector.py  # 数据采集器
├── database/           # 数据库模块
│   ├── db_manager.py      # 数据库管理器
│   ├── data_storage.py    # 数据存储处理器
│   └── data_query.py      # 数据查询处理器
├── tests/              # 测试文件
│   └── test_core.py
├── main.py             # 主程序入口
├── init.py             # 系统初始化脚本
└── requirements.txt    # 依赖包列表
```

## 安装部署

### 1. 环境要求
- Python 3.8+
- pip包管理器

### 2. 安装步骤

```bash
# 克隆项目
git clone <repository-url>
cd br_data_collector

# 安装依赖
python init.py

# 或手动安装
pip install -r requirements.txt
```

### 3. 配置文件

修改 `config/sample_config.json` 文件：

```json
{
  "points": [
    {
      "name": "temperature_sensor_1",
      "path": "ns=6;s=::OpcCon:usiBuffer.Temperature1",
      "description": "温度传感器1数据"
    }
  ],
  "groups": [
    {
      "name": "sensor_group_1",
      "interval_seconds": 5,
      "trigger": "time",
      "description": "传感器组1，每5秒采集一次",
      "data_points": ["temperature_sensor_1"]
    }
  ],
  "database": {
    "type": "sqlite",
    "name": "data_collection.db",
    "recreate_interval_days": 30,
    "batch_insert_size": 100,
    "data_group": "sensor_group_1"
  }
}
```

## 使用方法

### 1. 数据采集模式

```bash
# 启动数据采集
python main.py

# 指定配置文件
python main.py --config config/my_config.json
```

### 2. 数据查询模式

```bash
# 进入查询交互模式
python main.py --query

# 按提示输入查询参数：
# - 开始时间
# - 结束时间  
# - 输出文件路径
```

### 3. 系统控制

- **正常退出**: Ctrl+C
- **后台运行**: `nohup python main.py &`
- **查看日志**: `tail -f data_collector.log`

## 配置说明

### 数据点配置 (points)
- `name`: 自定义变量名
- `path`: OPC UA节点路径
- `description`: 描述信息

### 数据组配置 (groups)
- `name`: 数据组名称
- `interval_seconds`: 采样间隔(秒)
- `trigger`: 触发方式(time/variable)
- `data_points`: 包含的数据点名称列表
- `trigger_point`: 触发点名称(变量触发时必需)

### 数据库配置 (database)
- `type`: 数据库类型(mysql/sqlite)
- `name`: 数据库名称
- `host/port/username/password`: 连接参数
- `recreate_interval_days`: 分表间隔天数
- `batch_insert_size`: 批量插入大小
- `data_group`: 使用的数据组名称

## 开发指南

### 运行测试

```bash
python -m pytest tests/ -v
```

### 代码结构

1. **配置模块**: `core/` - 处理JSON配置文件的加载和验证
2. **通信模块**: `communication/` - 实现OPC UA通信协议
3. **数据库模块**: `database/` - 提供数据库访问和数据存储功能
4. **主程序**: `main.py` - 整合各模块，提供统一接口

### 扩展开发

#### 添加新的通信协议
1. 在 `communication/` 目录下创建新的客户端类
2. 实现相应的数据读取接口
3. 在主程序中集成新的通信方式

#### 添加新的数据库支持
1. 扩展 `database/db_manager.py` 中的连接逻辑
2. 实现相应数据库的SQL方言适配

## 性能优化建议

1. **合理设置批量大小**: 根据数据量调整 `batch_insert_size`
2. **优化采集频率**: 避免过于频繁的数据采集
3. **定期维护数据库**: 清理过期数据，优化索引
4. **监控系统资源**: 关注CPU、内存和磁盘使用情况

## 故障排除

### 常见问题

1. **OPC UA连接失败**
   - 检查服务器地址和端口
   - 确认网络连通性
   - 验证认证信息

2. **数据库写入失败**
   - 检查数据库连接参数
   - 确认有足够的磁盘空间
   - 查看数据库用户权限

3. **数据采集异常**
   - 查看日志文件 `data_collector.log`
   - 检查配置文件格式
   - 验证数据点路径正确性

### 日志分析

日志级别：
- INFO: 正常运行信息
- WARNING: 警告信息
- ERROR: 错误信息
- DEBUG: 调试详细信息

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系开发团队。