# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 当前目标版本：0.2.0

安装包版本来自 **`frontend/package.json`** 的 `version` 字段。打包日志首行须显示 `Version: 0.2.0` 与 `Expected: Report Editor-Setup-0.2.0-x64.exe`。

**本版更新说明**（写入 `packaging/updates/latest.json` 的 `notes`，应用内「检查更新」与 `latest.yml` 的 `releaseNotes` 均会展示）：

> 截批反馈状态/信息/路径节点可选并可手填 NodeId、修复保存后状态未写 true；备份恢复分步进度、加载完成才提示完成、免重启；修复新装后删除版式卡顿；启动预热右下角进度提示

发版前请 `git pull origin main`，确认上述 `notes` 已在仓库中；若需修改说明：

```powershell
node packaging\scripts\bump-version.mjs 0.2.0 --notes "你的更新说明"
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
| `-Notes <text>` | 与 `-Version` 写入 `latest.json` 说明 |

示例：

```powershell
.\build.ps1 -Fresh -PortalDir D:\web-portal-demo\public\downloads\report-editor
```

## 产物

```text
output/Report Editor-Setup-<version>-x64.exe
output/latest.yml          ← electron-builder 生成；publish 时会注入 releaseNotes
output/*.exe.blockmap      ← Windows 差分更新用（与 Setup 同名）
```

Windows 应用内更新默认**增量优先**（`latest.yml` + `.blockmap`），失败或用户选择时可下载完整安装包。

## 应用内更新说明如何展示

| 来源 | 用途 |
|------|------|
| `packaging/updates/latest.json` → `notes` | 设置页「更新说明」、启动更新提示 |
| `latest.yml` → `releaseNotes` | electron-updater 读取；由 publish 脚本从 `notes` 自动写入 |

打包前确认 `latest.json` 中 `notes` 非空；`build.ps1` 会在日志中打印当前 `Release notes`。

## 与 Mac 打包对齐的能力

| 能力 | 说明 |
|------|------|
| 版本校验 | `package.json` 与 `packaging/updates/latest.json` 不一致时报错 |
| 单测门禁 | 打包前执行 `npm test` |
| Portal 同步 | `publish-portal-release.mjs --only win`（优先本地新构建的 exe 计算 SHA256） |
| 拷贝校验 | publish 脚本校验 Portal 拷贝后文件大小一致 |

## 前置环境

- Windows x64
- Node.js **20.x 或 22.x LTS**（Node 24+ 开发请用 `scripts\dev\start_dev_electron_node22.bat`，打包脚本仍建议 22 LTS）
- Python 3.10+（含 `py` 启动器）

内网可设 Electron 镜像后再打包，详见 [../README.md](../README.md)。

现场安装见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
