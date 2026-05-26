# SD_SMA_ReportEditor

报表编辑器桌面软件：连接 MySQL/MariaDB、PostgreSQL 与 OPC UA，可视化配置报表模版，导出 **PDF**（不再生成 `.md` 成品，见 [_Doc/005](_Doc/005_交付格式决策-取消Markdown管线.md)）。

---

## 文档导航

| 我想… | 去看 |
|--------|------|
| **用 Cursor 打开并协作** | [Cursor 快速开始](#cursor-快速开始) |
| **弄清仓库里有什么** | [理解本仓库](#理解本仓库) |
| **在本机跑起来（开发）** | [如何运行](#如何运行) → [getting-started/](getting-started/README.md) |
| **改功能 / 改界面** | [如何修改](#如何修改) → [_Doc/003](_Doc/003_项目框架与常用指令.md) |
| **打安装包、现场安装卸载** | [packaging/README.md](packaging/README.md)（打包详述在此） |
| **查每个版本改了什么** | [_Doc/007_版本发布记录.md](_Doc/007_版本发布记录.md) |

技术栈：Python FastAPI · Vue 3 · Vite · Electron · Pinia。

---

## Cursor 快速开始

1. **工作区**：在 Cursor 中打开 Git 根目录 **`p000_sd_sma_scada`**（不要只打开子文件夹），才能加载 `.cursor/skills`、`.cursor/rules`。
2. **本工程路径**：`_Prj/SD_SMA_ReportEditor/`。
3. **界面协作 Skill**：`.cursor/skills/ui-ux-pro-max-report-editor/SKILL.md`（报表编辑器专用约定）。
4. **通用 UI 资源**（可选，在仓库根执行一次）：

```bash
cd p000_sd_sma_scada
npx uipro-cli init --ai cursor
```

5. **第一次跑通**：按系统阅读 [getting-started/README.md](getting-started/README.md)（Windows / Mac 依赖与启动）。

---

## 理解本仓库

本目录是 **P000 仓库** 下的报表编辑子工程，与 `_Doc/`（业务需求）、`SD_SMA_DATA_COLLECTOR` 等并列。

```
SD_SMA_ReportEditor/
├── README.md                 ← 本文件（开发向导）
├── getting-started/          ← 环境安装、开发启动、入门说明
├── packaging/                ← 安装包打包与排错（见 packaging/README.md）
├── scripts/dev/              ← Win/Mac 一键开发启停
├── backend/                  ← FastAPI（API、业务、data/ 运行时数据）
├── frontend/                 ← Vue + Electron 主应用（日常主改这里）
├── rptp/                     ← 报表版式原型（可选，见下表）
├── _Doc/                     ← 计划、里程碑、框架与 API 说明
└── docker-compose.yml        ← 可选演示库 / OPC（开发用）
```

| 目录 | 作用 | 日常是否改 |
|------|------|------------|
| `backend/` | 数据源、模板、生成、配置导入导出 | 常改 |
| `frontend/` | 页面、Electron 壳、报表 UI | 常改 |
| `scripts/` | 开发启停脚本 | 运行即可 |
| `rptp/` | 早期单页版式原型；主应用已承接其模型与 `rptp-*` 存储键 | 少见 |
| `packaging/` | NSIS / DMG 打包脚本与 `output/` | 发版时 |
| `getting-started/` | 新人文档 | 阅读 |

`rptp/`：`cd rptp && npm run dev` 可单独调试版式；与 `frontend/` 无构建依赖。详见 [frontend/src/lib/report-template/](frontend/src/lib/report-template/)。

开发脚本索引：[scripts/README.md](scripts/README.md)。

---

## 如何运行

> 依赖未装全时，务必先看 [getting-started/](getting-started/README.md)。

| 场景 | 做法 |
|------|------|
| **Windows · 浏览器开发** | `scripts\dev\windows\start_dev_web.bat`（后端 8000 + Vite 5173） |
| **Windows · 装依赖并启动** | `scripts\dev\windows\install_and_start_dev_web.bat` |
| **Windows · 停止端口** | `scripts\dev\windows\stop_dev_web.bat` |
| **macOS · Electron 开发** | 双击 `scripts/dev/mac/open-electron-dev-mac.command` |
| **通用 · 手写** | 终端 1：`backend` → `uvicorn main:app --reload --port 8000`；终端 2：`frontend` → `npm run dev` |
| **桌面接近成品** | `frontend` → `npm run electron:dev` |

健康检查：`curl -s http://127.0.0.1:8000/health` · 开发页 `http://127.0.0.1:5173` · API 文档 `http://127.0.0.1:8000/docs`。

Windows 上避免在旧 **cmd** 里长时间拖选文本（快速编辑会挂进程）；与一键脚本相同的后端入口：`backend\scripts\dev_uvicorn.ps1`。

---

## 如何修改

| 改什么 | 从哪里入手 |
|--------|------------|
| REST API、业务逻辑 | `backend/api/`、`backend/modules/`、`backend/schemas/` |
| 配置、运行模式、打包识别 | `backend/core/` |
| 页面与路由 | `frontend/src/views/`、`frontend/src/router/` |
| 报表模板 / 版式 UI | `frontend/src/lib/report-template/`、`frontend/src/features/` |
| Electron 启后端、路径 | `frontend/electron/main.cjs` |
| 架构、路由表、常用命令 | [_Doc/003_项目框架与常用指令.md](_Doc/003_项目框架与常用指令.md) |
| 需求与里程碑 | [_Doc/001](_Doc/001_项目计划.md)、[_Doc/002](_Doc/002_里程碑与工单.md) |

改 UI 前可对照 Cursor Skill：`ui-ux-pro-max-report-editor`。

---

## 打包与现场安装

交付用 **Windows Setup.exe** / **macOS DMG** 的脚本、手动 `npm` 命令、内网镜像与排错，均在 **[packaging/README.md](packaging/README.md)**，不在本页展开。

| 主题 | 链接 |
|------|------|
| 打包总览与排错 | [packaging/README.md](packaging/README.md) |
| Windows 一键打包 | [packaging/windows/](packaging/windows/README.md) |
| macOS 一键打包 | [packaging/mac/](packaging/mac/README.md) |
| 现场安装 / 卸载（Windows） | [getting-started/windows-installer.md](getting-started/windows-installer.md) |
| 现场安装 / 卸载（macOS） | [getting-started/mac-installer.md](getting-started/mac-installer.md) |

---

## 更多文档

- [初次上手 — getting-started/](getting-started/README.md)
- [Windows 环境](getting-started/windows.md) · [macOS 环境](getting-started/mac.md)
- [交付格式决策（为何不做 Markdown 成品）](_Doc/005_交付格式决策-取消Markdown管线.md)
- [里程碑与工单](_Doc/002_里程碑与工单.md)
- [Mac 开发补充](_Doc/004_Mac开发环境准备.md)
