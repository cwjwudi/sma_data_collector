# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 当前目标版本：0.2.5

安装包版本来自 **`frontend/package.json`** 的 `version` 字段。打包日志首行须显示 `Version: 0.2.5` 与 `Expected: Report Editor-Setup-0.2.5-x64.exe`。

**本版更新说明**（写入 `packaging/updates/latest.json` 的 `notes`，应用内「检查更新」与 `latest.yml` 的 `releaseNotes` 均会展示）：

> Report Editor 0.2.5
>
> - 修复数据参数「点选生成」可能导致整个软件卡死的问题；点选生成/SQL 参数等控件样式与属性面板统一
> - 新增 PLC 心跳（软件可用信号）：默认「常写 1」模式（软件每周期写 1、PLC 收到后清零），写入周期毫秒级可调（默认 200ms）；亦可选 Bool 翻转 / 计数累加
> - 云端同步新增「整机配置备份」：与配置备份同范围加密上传 Portal，换机一键恢复（需 Portal 支持）
> - 云端同步说明更清晰：团队模版/版式为发版快照，「我的」为最近一次上传内容

发版前请 `git pull origin main`，确认上述 `notes` 已在仓库中；若需修改说明：

```powershell
node packaging\scripts\bump-version.mjs 0.2.5 --notes "你的更新说明"
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

推荐加 `-Fresh`：只清掉**当前版本**的安装包 / `win-unpacked` / `latest.yml` 后重打；**其它版本的 `Report Editor-Setup-*.exe` 会保留**在 `output/`。

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
| `-Fresh` | 仅清理当前版本产物后重打；保留历史 `Setup-*.exe` |
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
| `output/Report Editor-Setup-0.2.5-x64.exe` | NSIS 安装包 |
| `output/latest.yml` | electron-updater 元数据（含 releaseNotes） |

## 排错

- **版本号不对**：先 `git pull`，确认 `frontend/package.json` 为 0.2.5
- **output 里有多个 Setup.exe**：正常现象（历史版本保留）；发版上传 Portal 时只用当前版本四件套
- **要彻底清空 output**：手动删除 `packaging\windows\output\` 下文件（脚本默认不再整目录清空）
- **PyInstaller 失败**：确认 Python venv 与 `backend/requirements.txt` 已安装
- **electron-builder 占用**：关闭正在运行的 Report Editor 后重试
