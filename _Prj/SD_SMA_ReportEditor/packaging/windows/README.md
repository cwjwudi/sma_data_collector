# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 当前目标版本：0.2.4

安装包版本来自 **`frontend/package.json`** 的 `version` 字段。打包日志首行须显示 `Version: 0.2.4` 与 `Expected: Report Editor-Setup-0.2.4-x64.exe`。

**本版更新说明**（写入 `packaging/updates/latest.json` 的 `notes`，应用内「检查更新」与 `latest.yml` 的 `releaseNotes` 均会展示）：

> Report Editor 0.2.4
>
> - 数据参数控件统一（模版编辑器与版式预设）：SQL 支持「点选生成」；参数来源新增「结批批次号」（复用自动结批 OPC 变量）
> - 修复结批失败误报「数据源检查未通过」：实为 PDF 渲染超时，错误提示已更正
> - PDF 导出渲染改用心跳超时：取数进行中不中断；连续 2 分钟无响应或总超 10 分钟才报错
> - 修复可视化 SQL 取值列保存丢失、配置缺失误导向数据源页、OPC 目录回退英文提示

发版前请 `git pull origin main`，确认上述 `notes` 已在仓库中；若需修改说明：

```powershell
node packaging\scripts\bump-version.mjs 0.2.4 --notes "你的更新说明"
```

## 一发版流程（推荐）

在仓库根目录打开 PowerShell 或 cmd：

```bat
cd _Prj\SD_SMA_ReportEditor
git pull origin main
cd packaging\windows
build.bat -Fresh
```

打包成功后脚本会自动运行 `publish-portal-release.mjs --only win`，生成 Win 安装包 SHA256，并将 `notes` 注入 `output/latest.yml` 的 `releaseNotes`。

**同步到 WebPortal**（任选其一）：

```powershell
# 方式 A：打包时指定 Portal 目录
.\build.ps1 -Fresh -PortalDir D:\path\to\web-portal-demo\public\downloads\report-editor

# 方式 B：环境变量
set REPORT_EDITOR_PORTAL_DIR=D:\path\to\web-portal-demo\public\downloads\report-editor
build.bat -Fresh

# 方式 C：打包后手动同步
cd ..\..
node packaging\scripts\publish-portal-release.mjs --copy-artifacts --only win --portal-dir D:\path\to\...\report-editor
```

**务必加 `-Fresh`**，否则 `output/` 里残留旧版 `Report Editor-Setup-*.exe` 会导致脚本报错退出。

## 运行

```bat
cd packaging\windows
build.bat -Fresh
```

成功结束后**不会**再弹出「按任意键继续」。失败时可加 `-NoPause`。

查看参数说明：

```powershell
.\build.ps1 -Help
```

## 参数

| 参数 | 作用 |
|------|------|
| `-Fresh` | 清空 `output/` 后再打包 |
| `-SkipFrontendInstall` | 跳过 `npm ci` |
| `-SkipBackendBuild` | 跳过 PyInstaller |
| `-PortalDir <path>` | 打包完成后同步到 Portal 静态目录 |
| `-Version <semver>` | 打包前 bump（一般已在 main bump 过则不必） |
| `-Notes <text>` | 与 `-Version` 写入 manifest |
| `-SkipTests` | 跳过 `npm test`（不推荐） |
| `-AllowVersionMismatch` | 仅警告 package.json 与 latest.json 不一致 |
| `-NoPause` | 失败时不等待按键 |

## 环境要求

- Windows 10/11 x64
- Node.js 20.x 或 22.x LTS
- Python 3.10+（PyInstaller 打后端）
- 首次打包会下载 Electron 与依赖，建议配置镜像（脚本默认 npmmirror）

## 产物

| 文件 | 说明 |
|------|------|
| `output/Report Editor-Setup-0.2.4-x64.exe` | NSIS 安装包 |
| `output/latest.yml` | electron-updater 元数据（含 releaseNotes） |

## 排错

- **版本号不对**：先 `git pull`，确认 `frontend/package.json` 为 0.2.4
- **output 里有多个 Setup.exe**：加 `-Fresh` 清空后重打
- **PyInstaller 失败**：确认 Python venv 与 `backend/requirements.txt` 已安装
- **electron-builder 占用**：关闭正在运行的 Report Editor 后重试
