# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 当前目标版本

安装包版本来自 **`frontend/package.json`** 的 `version` 字段（electron-builder 读取）。仓库当前应为 **0.1.20**；打包日志首行须显示 `Version: 0.1.20` 与 `Expected: Report Editor-Setup-0.1.20-x64.exe`。

若 Portal 上尚无 `0.1.20` 的 exe，在本机打完包后运行 `publish-portal-release.mjs --only win` 同步。

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

## 推荐发版命令

```powershell
git pull
.\build.ps1 -Fresh
```

或指定版本 bump（一般已在 main 上 bump 过则不必再写 `-Version`）：

```powershell
.\build.ps1 -Version 0.1.20 -Notes "更新说明" -Fresh
```

```bat
build.bat -Fresh
```

**务必加 `-Fresh`**，否则 `output/` 里残留的 `Report Editor-Setup-0.1.19-x64.exe` 等会导致脚本报错退出（防止误发旧版本）。

发版前也可手动 bump：

```powershell
node packaging\scripts\bump-version.mjs 0.1.20 --notes "说明"
```

## 与 Mac 打包对齐的能力

| 能力 | 说明 |
|------|------|
| `-Version` / `-Notes` | 打包前自动 bump |
| 版本强校验 | `package.json` 与 `latest.json` 不一致则失败 |
| 产物文件名校验 | 必须产出 `Report Editor-Setup-<version>-x64.exe` |
| `npm test` | 默认在 Vite 构建前执行（`-SkipTests` 可跳过） |
| `-Fresh` | 清空 `output/` |
| 发布后同步 | 自动 `publish-portal-release.mjs --only win`（保留同版本 Mac 条目） |

## 参数（传给 build.ps1）

| 参数 | 作用 |
|------|------|
| `-Version <semver>` | 打包前自动 bump |
| `-Notes <text>` | 与 `-Version` 写入 `latest.json` |
| `-Fresh` | 清空 `output/` 后再打包 |
| `-SkipFrontendInstall` | 跳过 `npm ci` |
| `-SkipBackendBuild` | 跳过 PyInstaller |
| `-SkipTests` | 跳过 `npm test`（不推荐） |
| `-NoPause` | 失败时也不弹出「按任意键继续」 |
| `-AllowVersionMismatch` | 仅警告版本不一致（不推荐） |
| `-Help` | 显示用法 |

## 产物

```text
output/Report Editor-Setup-<version>-x64.exe
```

打包成功后脚本会自动运行 `publish-portal-release.mjs --only win`：

- 写入/更新 `packaging/updates/latest.json` 中的 **win32-x64**（含 SHA256）
- **保留**同版本下已有的 **darwin-arm64** 条目
- 若 Portal 目录已挂载，复制安装包并同步 `latest.json`

手动同步（在 `_Prj/SD_SMA_ReportEditor` 目录）：

```powershell
node packaging\scripts\publish-portal-release.mjs --copy-artifacts --only win
```

## 打包失败：winCodeSign / 符号链接

若日志出现 `Cannot create symbolic link : A required privilege is not held by the client`，删除缓存 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 后重试。脚本也会在构建前尝试清理该缓存。

## 打包失败：npm ci / EBADENGINE

`engines.node` 为 `>=20 <24`。Node 24+ 时脚本自动为 `npm ci` 追加 `--ignore-engines`；建议使用 Node 22 LTS。

## 打包失败：vite build 只打印 Node 版本

脚本已设置 `NODE_OPTIONS=--max-old-space-size=8192`；若仍失败请换 Node 22 LTS。

现场安装与卸载见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
