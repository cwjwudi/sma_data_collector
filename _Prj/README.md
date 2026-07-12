# Prj

存放 **P000_SD_SMA_SCADA** 工程源码与可运行项目，与 **`_Doc/`** 中的需求、架构与变更记录配合使用。

## 子工程一览

| 目录 | 说明 |
| ---- | ---- |
| **`SD_SMA_DATA_COLLECTOR/`** | 数据采集服务（OPC UA → MySQL/SQLite），含 `web_config/` 配置界面（8091） |
| **`SD_SMA_DATA_COLLECTOR_QUERY_WEB/`** | 历史数据查询 + OPC UA 回写服务（8092） |
| **`SD_SMA_DB_ADMIN/`** | 数据库备份 / 恢复 / CSV 导入导出工具（8093） |
| **`SD_SMA_REPORT_COPY/`** | 报表 PDF 拷贝至 U 盘工具（Windows，8094） |
| **`SD_SMA_ReportEditor/`** | 报表编辑；[**packaging/**](./SD_SMA_ReportEditor/packaging/README.md)（Win/Mac 打包工具与 `output/`） |
| **`SD_SMA_SCADA_DEMO/`** | B&R SCADA 演示 / 主界面类工程（mappView） |
| **`SMA_DATA/`** | 早期 B&R 原型工程（遗留归档，接口已与 SCADA_DEMO 漂移，勿新用） |

四个 Python 服务的统一运行入口见 [**_Launcher/**](../_Launcher/README.md)。

具体技术栈、编译方式与运行依赖以各子目录内说明或 `_Doc` 为准。

## 关联

- **文档**：上级 **`_Doc/`**（需求、纪要、数据库与问题修复记录等）  
- **仓库入口**：见 [**README.md**](../README.md)
