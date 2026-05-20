# Windows 安装包 — 打包、安装与卸载

面向 **SD SMA Report Editor**（Electron 桌面版）的现场交付，生成标准 **NSIS 安装程序**，可在「设置 → 应用」中正常卸载。

---

## 一、在开发机上打包（仅需做一次）

### 环境要求

| 软件 | 说明 |
|------|------|
| Windows 10/11 **x64** | 打包机需为 Windows（或在 Windows CI 上执行） |
| Node.js LTS | 20.x / 22.x |
| Python 3.10+ | 含 **`py`** 启动器，用于 PyInstaller 打后端 |
| 磁盘空间 | 建议 ≥ 3 GB（含 Electron 与 PyInstaller 缓存） |

### 一键打包（推荐）

在 **`SD_SMA_ReportEditor/packaging/windows/`**：

```bat
build.bat
```

可选参数：

| 参数 | 作用 |
|------|------|
| `-Fresh` | 打包前清理 `packaging/windows/output/` |
| `-SkipFrontendInstall` | 跳过 `npm ci`（依赖已装好时） |
| `-SkipBackendBuild` | 跳过 PyInstaller（已有 `backend/dist/report_backend/` 时） |

**产物路径：**

```text
packaging/windows/output/SD SMA Report Editor-Setup-0.1.0-x64.exe
```

（版本号随 `frontend/package.json` 的 `version` 变化。）

### 等价 npm 命令

```powershell
cd frontend
npm install
npm.cmd run dist:win:cn:installer
```

同时打 **安装包 + 便携版** 时：`npm.cmd run dist:win:cn`（输出在 `frontend/release/`）。

---

## 二、现场安装（最终用户）

1. 将 **`SD SMA Report Editor-Setup-*-x64.exe`** 拷贝到目标 Windows 电脑。
2. 双击运行安装向导（非一键安装，可选择安装目录）。
3. 完成后可从 **桌面** 或 **开始菜单 → B&R Team → SD SMA 报表编辑器** 启动。
4. 首次运行会在用户目录创建数据文件夹：  
   `%APPDATA%\sd-sma-report-editor\backend-data\`  
   （模版、数据库连接、OPC 配置等，与程序安装目录分离。）

> **SmartScreen**：安装包未做代码签名时，Windows 可能提示「未知发布者」，需点「更多信息」→「仍要运行」。企业环境可申请 Authenticode 证书后对 `Setup.exe` 签名。

---

## 三、卸载

任选其一：

1. **设置** → **应用** → **已安装的应用** → **SD SMA 报表编辑器** → **卸载**
2. **开始菜单** → **B&R Team** 或程序组 → **卸载 SD SMA 报表编辑器**

卸载程序会：

- 删除安装目录下的程序文件
- 结束正在运行的主程序与内置后端进程
- **删除** `%APPDATA%\sd-sma-report-editor\`（含 `backend-data\` 里的数据库/OPC 连接、`config.json`、模版/版式，以及本机报表相关 localStorage 偏好）

因此 **卸载后重装** 会得到空白配置。若需保留配置，请在卸载前使用 **设置 → 配置导入/导出 → 导出（本机备份）**。

---

## 四、安装版与「运行环境诊断」

安装后打开 **设置 → 运行环境诊断** 时，后端会自动识别为 **安装版**：

- **不再** 对 `backend/venv`、`npm` 报黄灯（这些仅开发/打包机需要）。
- 检查项聚焦：内置后端、用户数据目录、`config.json`、端口 8000 等。
- **一键修复** 仅补齐数据目录与默认配置，不会在本机重装 Python 虚拟环境。

若仍看到 venv/npm 告警，说明当前连接的后端不是安装包内置进程（例如误开了开发用 uvicorn），请关闭其它后端后只启动桌面快捷方式。

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| NSIS `Plugin not found UAC::_` | 在 `frontend/` 执行 `npm.cmd run clean:eb-cache` 后重新打包 |
| `release` 目录被占用 | 使用 `packaging\windows\build.bat`（输出到 `packaging\windows\output`） |
| 安装后窗口白屏 | 确认已用最新代码打包（`vite.config.js` 中 `base: './'`） |
| 仅要绿色版、不要安装向导 | `npm.cmd run dist:cn:portable` → 便携 exe |

更多打包细节与排错见 [packaging/README.md](../packaging/README.md)。
