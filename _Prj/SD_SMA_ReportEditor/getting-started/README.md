# SD_SMA_ReportEditor — 初次上手

面向**第一次接触本仓库**的同事：先弄清「这是什么」，再按系统完成环境安装与启动。

---

## 建议阅读顺序

| 顺序 | 文档 | 内容 |
|------|------|------|
| 1 | **本文** | 仓库定位、目录含义、开发/运行模式 |
| 2 | [Windows 环境准备](windows.md) | 安装 Python / Node、首次依赖、启动方式 |
| 3 | [macOS 环境准备](mac.md) | Homebrew、venv、一键脚本、Electron 注意点 |

读完并跑通一次后，可继续查阅：

- 项目根 [README.md](../README.md) — 打包发布、故障排除
- [_Doc/003_项目框架与常用指令.md](../_Doc/003_项目框架与常用指令.md) — 架构、API、路由表
- [_Doc/004_Mac开发环境准备.md](../_Doc/004_Mac开发环境准备.md) — Mac 补充说明（与 `mac.md` 内容互补）
- 仓库总览 [../../README.md](../../README.md) — 整个 `p000_sd_sma_scada` 工程与 `_Doc` 需求文档

---

## 这个子工程是做什么的？

**SD_SMA_ReportEditor** 是 **新马药机 SmartData** 体系中的 **Markdown 报表编辑器**（桌面 + 浏览器调试）：

- 连接 **MySQL / MariaDB / PostgreSQL**（库可在群晖 NAS 等远程机器，本机不必装数据库服务）
- 连接 **OPC UA** 读取现场变量
- 用可视化界面编辑 **版式**、**报表模板**，生成 **Markdown / PDF** 报表

技术组成：

| 部分 | 技术 | 默认端口 |
|------|------|----------|
| 后端 API | Python 3.10+、FastAPI、Uvicorn | `8000` |
| 前端界面 | Vue 3、Vite | `5173`（开发） |
| 桌面壳 | Electron（开发时自动拉起后端子进程） | — |

---

## 在整个 Git 仓库中的位置

```
p000_sd_sma_scada/                 ← Git 根目录（建议用 Cursor 打开此目录）
├── _Doc/                          ← 需求、会议纪要、数据库记录（业务背景）
├── _Prj/
│   ├── README.md
│   ├── SD_SMA_DATA_COLLECTOR/     ← 数据采集
│   ├── SD_SMA_ReportEditor/       ← 【你在这里】报表编辑
│   └── SD_SMA_SCADA_DEMO/         ← SCADA 演示
└── README.md
```

**不要**只克隆子文件夹到本地——应克隆整个 `p000_sd_sma_scada`，以便对照 `_Doc` 里的需求与案例 PDF。

---

## 本目录（SD_SMA_ReportEditor）结构

```
SD_SMA_ReportEditor/
├── getting-started/     ← 初次上手（Windows / Mac 环境、启动）
├── _Doc/                ← 计划、工单、框架说明（偏项目内部）
├── backend/             ← FastAPI；运行时数据在 backend/data/（git 忽略）
│   ├── main.py
│   ├── requirements.txt
│   ├── scripts/         ← dev_uvicorn.ps1 / .sh 等
│   └── venv/            ← 本地虚拟环境（需自行创建，不入库）
├── frontend/            ← Vue + Electron
│   ├── package.json
│   ├── electron/        ← 主进程 main.cjs（拉起 Python）
│   └── src/             ← 页面与组件
├── scripts/             ← 如 open-electron-dev-mac.command（Mac 一键）
├── start_dev_web.bat    ← Windows 浏览器模式一键启动
├── stop_dev_web.bat
└── README.md
```

可选目录 **`rptp/`**：报表相关 TypeScript 工具/模板源码，日常开发以前端 `frontend/` 与 `backend/` 为主。

---

## 三种运行方式（先建立概念）

| 模式 | 适用场景 | 如何启动 |
|------|----------|----------|
| **Web 开发** | 调 UI、对照浏览器 DevTools；后端、前端各看一个终端日志 | Windows：`start_dev_web.bat`；Mac：见 [mac.md](mac.md) 双终端命令 |
| **Electron 开发** | 接近最终桌面体验；后端常由 Electron 自动启动 | `frontend` 下 `npm run electron:dev`；Mac 可双击 `scripts/open-electron-dev-mac.command` |
| **Windows 安装包** | 交付现场、无 Python 环境 | `frontend` 下 `npm run dist:win` 等，见根 [README.md](../README.md) |

健康检查（后端已启动时）：

```bash
curl -s http://127.0.0.1:8000/health
```

浏览器开发地址：`http://127.0.0.1:5173`  
API 文档：`http://127.0.0.1:8000/docs`

---

## 必须安装 vs 不必安装

| 组件 | 开发本机 | 说明 |
|------|----------|------|
| **Python 3.10+** | 必须 | 推荐 3.12；在 `backend/` 建 `venv` 并 `pip install -r requirements.txt` |
| **Node.js LTS** | 必须 | 带 `npm`；在 `frontend/` 执行 `npm install` |
| **Git** | 推荐 | 克隆与更新仓库 |
| **MySQL / PostgreSQL** | 不必（常用） | 数据库在 NAS/服务器时，应用内填 IP/端口即可 |
| **OPC UA Server** | 按需 | 仅调试 OPC 绑定时需要可达的 UA 端点 |

---

## 首次跑通检查清单

- [ ] 已克隆 `p000_sd_sma_scada`，并进入 `SD_SMA_ReportEditor`
- [ ] `backend/venv` 已创建且 `pip install -r requirements.txt` 成功
- [ ] `frontend/node_modules` 已存在（`npm install`）
- [ ] `curl http://127.0.0.1:8000/health` 返回 JSON
- [ ] 浏览器能打开 `http://127.0.0.1:5173` 或 Electron 窗口正常
- [ ] 已在「数据源」页理解：数据库/OPC 为**运行时配置**，不写在 Git 里（见 `backend/data/config.json`）

---

## 数据存在哪里？

| 环境 | 配置与模板路径 |
|------|----------------|
| **开发**（源码运行） | `backend/data/`（首次启动自动创建；已在 `.gitignore`） |
| **Windows 安装包** | `%APPDATA%\sd-sma-report-editor\backend-data\` |

团队共享的是**代码与文档**；连接串、密码、模板 JSON 默认在各自机器的数据目录，可通过应用内「设置 → 配置导入导出」迁移。

---

## 常见问题（入门）

**Q：拉代码后只有源码，没有 `venv` / `node_modules`？**  
A：正常。按 [windows.md](windows.md) 或 [mac.md](mac.md) 各装一次。

**Q：端口 8000 或 5173 被占用？**  
A：关闭旧的后端/Vite 窗口；Mac 一键脚本会自动尝试释放端口。

**Q：Electron 白屏？**  
A：确认 Vite 在 5173 监听（`strictPort`）；看 Electron 与终端报错；可改用手动双终端 + `npm run dev` 排查。

**Q：和 Automation Studio / mappView 什么关系？**  
A：本工具是**独立 Windows 桌面/Web 技术栈**的报表配置端；现场 SCADA 演示见 `_Prj/SD_SMA_SCADA_DEMO/`，需求见仓库 `_Doc/`。

---

下一步：根据你的系统打开 **[Windows](windows.md)** 或 **[macOS](mac.md)** 完成安装与第一次启动。
