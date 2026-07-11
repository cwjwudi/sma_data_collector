# Windows 安装包 — 打包、安装与卸载

面向 **Report Editor AI（报表编辑器 AI 版）**（Electron 桌面版）的现场交付，生成标准 **NSIS 安装程序**，可在「设置 → 应用」中正常卸载。

可与原版 **Report Editor** 并装共存（不同 `appId` 与 `%APPDATA%` 目录）。两版共用本机后端端口 **8000**，**请勿同时启动**。

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
| `-Fresh` | 打包前清理当前版本产物（保留历史 Setup） |
| `-SkipFrontendInstall` | 跳过 `npm ci`（依赖已装好时） |
| `-SkipBackendBuild` | 跳过 PyInstaller（已有 `backend/dist/report_backend/` 时） |

**产物路径：**

```text
packaging/windows/output/Report Editor AI-Setup-<version>-x64.exe
```

（版本号随 `frontend/package.json` 的 `version` 变化。）

### 等价 npm 命令

```powershell
cd frontend
npm install
npm.cmd run dist:win:cn:installer
```

---

## 二、现场安装（最终用户）

1. 将 **`Report Editor AI-Setup-*-x64.exe`** 拷贝到目标 Windows 电脑。
2. 双击运行安装向导（非一键安装，可选择安装目录）。
3. 完成后可从 **桌面** 或 **开始菜单** 启动 **Report Editor AI**。
4. 首次运行会在用户目录创建数据文件夹：  
   `%APPDATA%\sd-sma-report-editor-ai\backend-data\`  
   （模版、数据库连接、OPC 配置等，与程序安装目录分离；与原版 `%APPDATA%\sd-sma-report-editor\` 互不影响。）

### 从原版迁移配置

1. 在原版中：**设置 → 备份与恢复 → 导出备份文件**（得到 `.rebak`）。
2. 安装并打开 AI 版后：**设置 → 备份与恢复 → 选择备份文件** 导入即可（格式互通）。

> **SmartScreen**：安装包未做代码签名时，Windows 可能提示「未知发布者」，需点「更多信息」→「仍要运行」。企业环境可申请 Authenticode 证书后对 `Setup.exe` 签名。

---

## 三、卸载与升级

### 应用内升级（Setup 覆盖安装）

- 数据库 / OPC UA 连接、模版等保存在 **`%APPDATA%\sd-sma-report-editor-ai\backend-data\`**，与程序安装目录分离。
- **正常升级应保留上述数据**。
- 若升级后配置仍为空，请检查是否曾手动卸载过程序，或升级前是否使用过 **开发模式**（数据在仓库 `backend/data/`，与安装版路径不同）。

### 主动卸载

任选其一：

1. **设置** → **应用** → **已安装的应用** → **Report Editor AI** → **卸载**
2. **开始菜单** 程序组 → **卸载 Report Editor AI**

卸载程序会：

- 删除安装目录下的程序文件
- 结束正在运行的主程序与内置后端进程
- **删除** `%APPDATA%\sd-sma-report-editor-ai\`（含 `backend-data\`）

因此 **卸载后重装** 会得到空白配置。若需保留配置，请在卸载前使用 **设置 → 备份与恢复 → 导出备份文件**。卸载时也可选择备份到「文档\ReportEditorAI-Backup」。

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
| `release` 目录被占用 | 使用 `packaging\windows\build.bat`（输出到 `packaging\windows/output`） |
| 安装后窗口白屏 | 确认已用最新代码打包（`vite.config.js` 中 `base: './'`） |
| 仅要绿色版、不要安装向导 | `npm.cmd run dist:cn:portable` → 便携 exe |
| 与原版同时开打不开 | 两版共用端口 8000，请先退出另一版 |

更多打包细节与排错见 [packaging/README.md](../packaging/README.md)。
