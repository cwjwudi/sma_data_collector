# Windows — 环境准备与启动

---

## 一、需要安装什么

| 软件 | 版本建议 | 用途 | 获取方式 |
|------|----------|------|----------|
| **Python** | **3.10+**（推荐 3.12） | 运行 FastAPI 后端 | [python.org](https://www.python.org/downloads/) 安装时勾选 **Add python.exe to PATH** |
| **Node.js** | **LTS**（20.x / 22.x） | 前端构建、Electron | [nodejs.org](https://nodejs.org/) |
| **Git** | 2.x | 克隆仓库 | 可选 [Git for Windows](https://git-scm.com/download/win) |
| **PowerShell** | 5.1+（系统自带） | 运行开发脚本 | 推荐使用 **Windows Terminal** |

**不必**在本机安装 MySQL/PostgreSQL（若数据库在 NAS/服务器上）。OPC UA 仅在调试 OPC 功能时需要现场或模拟器。

---

## 二、克隆与进入目录

```powershell
cd D:\你的路径\
git clone <Gitea 仓库地址> p000_sd_sma_scada
cd p000_sd_sma_scada\_Prj\SD_SMA_ReportEditor
```

后续命令默认在此目录（项目根）或其子目录 `backend`、`frontend` 下执行。

---

## 三、后端：虚拟环境与依赖

在 **PowerShell** 或 **Windows Terminal** 中：

```powershell
cd backend

# 创建虚拟环境
python -m venv venv

# 安装依赖（使用 venv 内 pip）
.\venv\Scripts\pip.exe install -r requirements.txt
```

验证：

```powershell
.\venv\Scripts\python.exe --version    # 应 ≥ 3.10
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

另开终端访问 `http://127.0.0.1:8000/health` 或 `http://127.0.0.1:8000/docs`。按 `Ctrl+C` 停止。

> **提示**：避免在旧版 **cmd** 窗口里用鼠标拖选文本触发「快速编辑」导致进程假死；请用 PowerShell / Windows Terminal（与 `start_dev_web.bat` 行为一致）。

---

## 四、前端：npm 依赖

```powershell
cd ..\frontend
npm install
```

国内网络可加镜像（可选）：

```powershell
npm install --registry https://registry.npmmirror.com
```

若 PowerShell 拦截 `npm.ps1`，请使用 **`npm.cmd`**（例如 `npm.cmd run dev`）。

---

## 五、启动软件

### 方式 A：浏览器开发（推荐第一次）

在 **项目根目录** `SD_SMA_ReportEditor/` 双击或执行：

```text
start_dev_web.bat
```

脚本会：

1. 新窗口启动后端（`backend\scripts\dev_uvicorn.ps1` → `127.0.0.1:8000`）
2. 新窗口启动 Vite（`http://127.0.0.1:5173`）
3. 等待就绪后自动打开浏览器

停止：关闭两个 PowerShell 窗口，或运行 **`stop_dev_web.bat`**。

### 方式 B：Electron 桌面（接近最终产品）

```powershell
cd frontend
npm run electron:dev
```

将并行启动 Vite 与 Electron；后端由 **Electron 主进程**尝试使用 `backend\venv\Scripts\python.exe` 拉起。若失败，请先按第三节手动确认 `venv` 可用，或单独开终端运行 `dev_uvicorn.ps1` 后再执行 `npm run electron:dev`。

### 方式 C：手动分终端（排错）

**终端 1 — 后端：**

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev_uvicorn.ps1
```

**终端 2 — 前端：**

```powershell
cd frontend
npm run dev
```

浏览器打开：`http://127.0.0.1:5173`

---

## 六、自检命令

```powershell
# 后端健康
curl http://127.0.0.1:8000/health

# 版本
.\backend\venv\Scripts\python.exe --version
node --version
npm --version
```

---

## 七、打包 Windows 安装包（现场交付）

面向**交付现场**（非日常开发）。**推荐**在项目根双击或执行：

```bat
build_windows_installer.bat
```

等价于：安装依赖 → PyInstaller 后端 → Vite 构建 → **仅生成 NSIS 安装程序**（`frontend/release-installer/`）。

也可在 `frontend/` 手动执行：`npm.cmd run dist:win:cn:installer`（仅安装包）或 `npm.cmd run dist:win:cn`（安装包 + 便携版）。

**安装 / 卸载** 说明见 [**windows-installer.md**](windows-installer.md)；排错（白屏、NSIS、文件占用）见 [README.md](../README.md)。

---

## 八、与 Mac 的差异

| 项目 | Windows | macOS |
|------|---------|--------|
| 一键 Web 启动 | `start_dev_web.bat` | 无 bat；见 [mac.md](mac.md) |
| Python 路径 | `backend\venv\Scripts\python.exe` | `backend/venv/bin/python3` |
| Electron 一键 | `npm run electron:dev` | `scripts/open-electron-dev-mac.command` |

---

[← 返回入门总览](README.md)
