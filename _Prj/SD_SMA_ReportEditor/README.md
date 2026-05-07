# SD_SMA_ReportEditor

Markdown 报表编辑器桌面软件。支持读取 MySQL/PostgreSQL 数据库与 OPC UA 变量，通过可视化界面配置报表模板，自动生成 Markdown 报表。

## 技术栈

- **后端**：Python 3.10+ / FastAPI / SQLAlchemy / asyncua
- **前端**：Electron / Vue 3 / Vite / Pinia
- **桌面壳**：Electron（内嵌 Vue 前端 + 启动 Python 后端子进程）

## 目录结构

```
SD_SMA_ReportEditor/
├── _Doc/           # 项目文档（计划、工单、变更记录）
├── backend/        # Python FastAPI 后端
├── frontend/       # Electron + Vue 3 前端
└── README.md
```

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### Electron 桌面模式

```bash
cd frontend
npm run electron:dev
```

## Windows 安装包 / 绿色便携版（.exe）

成品在 `frontend/release/`（不入库）：

1. 前置：已安装 **Node.js**、**Python 3.10+**（含 `py` 启动器）、Windows x64。
2. 在 `frontend/` 安装依赖：`npm install`
3. **一键完整打包**（先 PyInstaller 打后端，再 electron-builder 打安装包 + 便携 exe）：  
   `npm run dist:win`（PowerShell 可用 **`npm.cmd run dist:win`**）
4. 若 **`electron-v*-win32-x64.zip` 从 GitHub 下载超时**（常见于内网或对 `github.com` 不稳定），使用 **npmmirror 镜像** 再打一次：  
   `npm.cmd run dist:win:cn`  
   若后端已编好、只重打 Electron：  
   `npm.cmd run dist:cn`
5. 仅打前端包（需已存在 `backend/dist/report_backend/`）：  
   `npm run dist`

**网络说明**：`winCodeSign` 相关下载已通过 `build.win` 中 `signAndEditExecutable` / `signDlls` 关闭。**Electron 本体**仍默认从 GitHub 拉取；镜像失败时可自行设系统/会话代理，或 PowerShell 临时：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm.cmd run dist:win
```

（与 `dist:win:cn` 等价思路。）PowerShell 若拦截 `npm.ps1`，请统一使用 **`npm.cmd`**。

**打包报 `Access is denied` / `app.asar` 仍被占用**：`clean:release` 会用 **Win32 进程表**多轮结束「可执行路径落在 `win-unpacked` 下」的进程（含易漏掉的 Electron 子进程与 **`report_backend.exe`**）。若仍删不掉，常见是 **Cursor 打开了该目录下文件**或资源管理器预览锁了 **`app.asar`**：请关掉相关编辑器标签与文件夹窗口后再执行 **`npm.cmd run clean:release`**，然后 **`npm.cmd run dist:cn`**（或 **`dist:cn:fresh`** / **`dist:win:cn:fresh`**）。

成品说明：

- **NSIS 安装程序**：`SD SMA Report Editor-Setup-0.1.0-x64.exe`
- **便携版**：`SD SMA Report Editor-Portable-0.1.0-x64.exe`
- 安装/解压后，后端为内置的 `report_backend.exe`，**配置文件与模板等** 写在用户目录：`%APPDATA%\sd-sma-report-editor\backend-data\`（环境变量 `REPORT_EDITOR_DATA_DIR`）。

单独重建后端可执行文件：

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File scripts/build-backend-exe.ps1
```

## 文档

- [项目计划](_Doc/001_项目计划.md)
- [里程碑与工单](_Doc/002_里程碑与工单.md)
