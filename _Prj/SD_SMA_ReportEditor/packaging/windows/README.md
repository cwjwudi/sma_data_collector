# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 当前目标版本

安装包版本来自 **`frontend/package.json`** 的 `version` 字段（electron-builder 读取）。仓库当前应为 **0.1.25**；打包日志首行须显示 `Version: 0.1.25` 与 `Expected: Report Editor-Setup-0.1.25-x64.exe`。

## 一发版流程（推荐）

在仓库根目录打开 PowerShell 或 cmd：

```bat
cd _Prj\SD_SMA_ReportEditor
git pull origin main
cd packaging\windows
build.bat -Fresh
```

打包成功后同步 Portal（生成 SHA256，保留 Mac 同版本条目）：

```powershell
cd ..\..
node packaging\scripts\publish-portal-release.mjs --copy-artifacts --only win
```

若 Portal 目录未自动挂载，指定路径：

```powershell
node packaging\scripts\publish-portal-release.mjs --copy-artifacts --only win --portal-dir D:\path\to\web-portal-demo\public\downloads\report-editor
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
| `-Version <semver>` | 打包前 bump（一般已在 main bump 过则不必） |
| `-Notes <text>` | 与 `-Version` 写入 `latest.json` 说明 |

示例（需在本机 bump 时）：

```powershell
.\build.ps1 -Version 0.1.25 -Notes "更新说明" -Fresh
```

发版前也可在 `_Prj/SD_SMA_ReportEditor` 手动 bump：

```powershell
node packaging\scripts\bump-version.mjs 0.1.25 --notes "说明"
```

## 产物

```text
output/Report Editor-Setup-<version>-x64.exe
output/latest.yml          ← electron-builder 生成，Windows 增量更新用
output/*.exe.blockmap      ← 与 Setup 同名的 blockmap
```

## 与 Mac 打包对齐的能力

| 能力 | 说明 |
|------|------|
| 版本校验 | `package.json` 与 `packaging/updates/latest.json` 不一致时报错 |
| 单测门禁 | 打包前执行 `npm test` |
| Portal 同步 | `publish-portal-release.mjs --only win` |

## 前置环境

- Windows x64
- Node.js **20.x 或 22.x LTS**（Node 24+ 开发请用 `scripts\dev\start_dev_electron_node22.bat`，打包脚本仍建议 22 LTS）
- Python 3.10+（含 `py` 启动器）

内网可设 Electron 镜像后再打包，详见 [../README.md](../README.md)。

现场安装见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
