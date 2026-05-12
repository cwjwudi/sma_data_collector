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

## Cursor：UI/UX Pro Max Skill（混合安装）

报表编辑器的界面协作约定位于仓库根 **`.cursor/skills/ui-ux-pro-max-report-editor/SKILL.md`**。通用设计资源请在本仓库根目录执行：

```bash
cd P000_SD_SMA_SCADA   # 即本仓库 Git 根目录
npx uipro-cli init --ai cursor
```

CLI 产物是否提交由团队自定；**请以仓库根作为 Cursor 工作区打开**，以便加载 `.cursor/skills` 与 `.cursor/rules`。

## 快速开始

可使用项目根目录 **`start_dev_web.bat`** 一键启动后端 + 前端并在浏览器打开（详见脚本内说明）。

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

**当 `release\win-unpacked` 被 Cursor 锁住、删/改名都失败时**：改用 **另一输出目录** 打包（不碰 `release/`）：

```powershell
npm.cmd run dist:cn:alt
```

产物在 **`frontend/release-alt/`**（安装包/便携 exe 与 `win-unpacked` 均在此目录下）。完整流程（含后端）：`npm.cmd run dist:win:cn:alt`。清理备用目录：`npm.cmd run clean:release:alt`。

**NSIS 报错 `Plugin not found, cannot call UAC::_`**：多为 `%LOCALAPPDATA%\electron-builder\Cache\nsis` 不完整（下载后 `rename ... Access is denied` 造成）。先关闭其它正在跑的 electron-builder/杀毒对缓存目录的占用，再执行 **`npm.cmd run clean:eb-cache`**，然后重新 **`npm.cmd run dist:cn:alt`**。若暂时不需要安装包，可只打便携版：**`npm.cmd run dist:cn:portable`**（无 NSIS，仍输出到 `release-alt/`）。

**Portable / 安装版窗口空白（白屏）**：Electron 用 `file://` 打开页面时，Vite 默认 **`base: '/'`** 会让资源路径变成 `/assets/...`，从盘符根找文件导致加载失败。`vite.config.js` 已设 **`base: './'`**，请 **重新构建**（`npm.cmd run build` + `electron-builder`，或直接 **`npm.cmd run dist:cn:alt` / `dist:win:cn:alt`**）后再双击新 exe。

**双击 exe 仍报 `require is not defined`（主进程）**：开发目录的 `package.json` 带 `"type":"module"` 仅服务于 Vite；**安装包内的 `package.json`** 由 **`build.extraMetadata`** 写成 **`type: commonjs`** 并固定 **`main: electron/main.cjs`**。请 **`git pull`** 后务必 **重新执行 `npm.cmd run dist:cn:alt`**，再用 **`release-alt`** 下新生成的 exe；勿继续运行旧次打包的 `release` / `release-alt` 文件。

**打包报 `Access is denied` / `app.asar` 仍被占用**：`clean:release` 会多轮结束落在 `win-unpacked` 下的进程；若仍失败会尝试改名 `_trash_`。请配合 **`.cursorignore` + Reload Window**；或直接使用上文 **`dist:cn:alt`**。

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
