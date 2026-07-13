# P000 SD SMA SCADA（新马药机 · SmartData）

本仓库为 **新马药机** 侧 **SCADA / 数据采集 / 电子报表 / 数据库** 相关开发与文档，需求来源见 **`_Doc/001_需求整理/新马数据需求整理.md`**（SmartData 数据需求整理幻灯片稿）。

---

## 项目概述

在 **独立于 AR 程序、运行于 Windows** 的前提下，通过 **OPC UA** 获取下位数据，完成 **生产 / 配方 / 审计 / 报警 / 其它信息** 等数据的存储与查询；**报表为 PDF**（支持加密）；数据需 **可备份、可迁移**，并在 **Hypervisor 等故障场景下仍可恢复**（需求详见需求文档「期待方案」与会议纪要）。

---

## 数据类别（需求文档「一、数据类别」）

| 类别 | 要点（摘录） |
| ---- | ------------ |
| **生产数据** | 按事件/时间间隔存储；按批号、时间查询；变量名/描述/单位可配置 |
| **配方数据** | 按事件存储；按批号、时间查询；变量可配置 |
| **审计追踪** | 按钮操作、数值变化等；Who/When/What；按批号、时间查询 |
| **报警记录** | 触发存储；按批号、时间查询 |
| **其它信息** | 开批存储、结批查询；初期可固定内容与报表格式 |

**报表与查看**：报表 **PDF**、可加密；支持 **在线查看/打印**，以及 **Windows 下拷贝至 U 盘**。

---

## 建议软件拓扑（摘录）

- **数据库操作后端**：备份/转移/还原、CRUD、自动建表  
- **OPC UA 数据获取**：变量配置、读写、前后端交互  
- **报表后端**：格式编辑、数据源关联、发布（PDF 等）  
- **管理后端**：打印、关机/退出、资源与盘符、文件/U 盘等  
- **实时表 / 历史表**：短周期与按周期分表长期存储  
- **前端方向**：**Arsim + mappView**（OPC UA remote）、审计/报警/配方/用户/电子签名/采集配置/趋势(ECharts)/报表 PDF 等（详见需求文档「功能拆分」）

> 完整条文、示意图与「现有方案 / 期待方案 / 需求总结」请以 [**新马数据需求整理.md**](./_Doc/001_需求整理/新马数据需求整理.md) 为准。

---

## 目录结构

| 路径 | 说明 |
| ---- | ---- |
| **`_Doc/`** | 需求、会议纪要、数据库记录、修复记录、技术栈教程、配图等 |
| **`_Prj/`** | 工程源码（7 个子工程），见 [_Prj/README.md](./_Prj/README.md) 与下方「子工程」表 |
| **`_Launcher/`** | **统一启动器**（运行入口）：一键启动/监管 4 个 Python 服务，含便携打包脚本，见 [_Launcher/README.md](./_Launcher/README.md) |
| **`web-portal-demo/`** | ReportEditor 自动更新/分发的静态站点暂存 |

---

## 文档索引（`_Doc`）

| 文档 | 说明 |
| ---- | ---- |
| [001_需求整理/新马数据需求整理.md](./_Doc/001_需求整理/新马数据需求整理.md) | **主需求**：数据类型、报表、工作流、现有/期待方案、拓扑与功能拆分 |
| [002_会议纪要/会议纪要_2026-03-03_需求讨论与方案.md](./_Doc/002_会议纪要/会议纪要_2026-03-03_需求讨论与方案.md) | 需求讨论、Confluence 链接、任务与方案摘要 |
| [005_框架技术栈与教程.md](./_Doc/005_框架技术栈与教程.md) | **技术栈总览**（FastAPI、Vue3、Vite、Electron、OPC UA、SQLAlchemy 等）与教程入口 |
| [003_数据库相关信息记录/数据库相关信息记录.md](./_Doc/003_数据库相关信息记录/数据库相关信息记录.md) | 数据库相关记录 |
| [004_错误推送修复记录/如何修复未加忽略文件的错误推送.md](./_Doc/004_错误推送修复记录/如何修复未加忽略文件的错误推送.md) | Git 大文件/忽略项修复说明 |
| `image/` | 需求与技术文档配图 |

---

## 技术栈摘要

实现侧以 **`_Doc/005_框架技术栈与教程.md`** 为准，主要包括：

- **后端（Python）**：FastAPI、Uvicorn、SQLAlchemy、asyncua（OPC UA）、Pydantic 等  
- **前端（ReportEditor 等）**：Vue 3、Vite、vue-router、Pinia、Electron 等  

各子工程目录与命令另见 **`_Prj/SD_SMA_ReportEditor/_Doc/`** 等子项目内文档。

---

## 子工程（`_Prj`）

| 目录 | 角色 |
| ---- | ---- |
| `SD_SMA_DATA_COLLECTOR/` | 数据采集服务（OPC UA → MySQL/SQLite），含 `web_config/` 配置界面（默认端口 8091） |
| `SD_SMA_DATA_COLLECTOR_QUERY_WEB/` | 历史数据查询 + OPC UA 回写服务（默认端口 8092） |
| `SD_SMA_DB_ADMIN/` | 数据库备份 / 恢复 / CSV 导入导出工具（默认端口 8093） |
| `SD_SMA_REPORT_COPY/` | 报表 PDF 拷贝至 U 盘工具（Windows，默认端口 8094） |
| `SD_SMA_ReportEditor/` | 报表编辑器（Electron + Vue3 + FastAPI + AI 辅助）；打包见 `packaging/windows/`、`packaging/mac/` |
| `SD_SMA_SCADA_DEMO/` | B&R Automation Studio SCADA 演示 / 主界面类工程（mappView） |
| `SMA_DATA/` | 早期 B&R 数据采集原型工程（遗留归档，接口已与 SCADA_DEMO 漂移，勿新用） |

详见 [**_Prj/README.md**](./_Prj/README.md)。四个 Python 服务的统一运行入口为 **`_Launcher/`**。

### 本机开发/测试环境（uv）

仓库根提供统一的 uv 开发环境（`pyproject.toml` + `uv.lock`，Python 3.12，依赖为各子工程 requirements 的并集；现场部署仍以各子工程 `requirements*.txt` 为准）：

```bash
uv sync                                        # 一次性创建 .venv
uv run --directory _Prj/<子工程> python -m pytest tests -q   # 运行子工程测试
```

### 部署相关环境变量

| 变量 | 作用 |
| ---- | ---- |
| `SD_SMA_DB_PASSWORD` | 数据库密码注入（采集器 / QUERY_WEB），配置文件不再保存明文口令 |
| `SD_SMA_WEB_TOKEN` | 四个 Web 服务的远程访问令牌（请求头 `X-SD-SMA-Token`；loopback 免令牌，未设置时非本机一律 403） |
| `SD_SMA_BIND_HOST` | `start_collector.bat` / `start_query_web.bat` 监听地址覆盖（默认 127.0.0.1） |
| `SD_SMA_RESTART_MAX_RESTARTS` 等 `SD_SMA_RESTART_*` | Launcher 崩溃自动重启策略（默认窗口 60s 内最多重启 3 次，指数退避 1s/2s/4s，设 0 恢复 fail-fast） |
| `REPORT_EDITOR_CORS_ORIGINS` | ReportEditor 后端 CORS 白名单扩展（逗号分隔） |
| `MARIADB_ROOT_PASSWORD` | ReportEditor docker-compose 演示库口令（必填，不再内置默认值） |

---

## 版本控制

- **远程仓库**：`https://brgitea.x.ddnsto.com/BRTeam/P000_SD_SMA_SCADA.git`（以实际 `git remote` 为准）

---

## 变更记录

| 日期 | 说明 |
| ---- | ---- |
| 2026-07-12 | 子工程清单补全为 7 个；新增 `_Launcher` 运行入口与根级 uv 开发环境说明；`.gitignore` 修正（`*.zip` 去重、B&R `Package.pkg` 免忽略）；摘除误跟踪的 `data_collector.log`。 |
| 2026-03-19 | README 按《新马数据需求整理》与会议纪要、005 技术栈文档充实项目说明与索引。 |
| 2026-03-19 | 更正品牌表述为「新马」；新增 README / _Prj/README。 |
