# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 运行

```bat
cd packaging\windows
build.bat
```

成功结束后**不会**再弹出「按任意键继续」。若失败且希望跳过该提示，可加 `-NoPause` 或设置环境变量 `REPORT_EDITOR_BUILD_NO_PAUSE=1`。

## 版本号

安装包版本来自 **`frontend/package.json`** 的 `version` 字段（electron-builder 读取）。发版前请确认：

1. 已 `git pull` 到含目标版本的 main（例如 **0.1.16**）
2. 或在本机执行：`node packaging/scripts/bump-version.mjs 0.1.16 --notes "说明"`
3. 打包日志首行应显示 `Version: 0.1.16` 与 `Expected: Report Editor-Setup-0.1.16-x64.exe`；若不一致，说明代码未更新到最新

`npm ci` 使用 `package-lock.json`，**不会**改 `package.json` 版本；若锁文件根版本滞后，脚本会**自动同步** `package-lock.json` 与 `package.json`（仅版本字段）。

## 参数（传给 build.ps1）

| 参数 | 作用 |
|------|------|
| `-Fresh` | 清空 `output/` 后再打包 |
| `-SkipFrontendInstall` | 跳过 `npm ci` |
| `-SkipBackendBuild` | 跳过 PyInstaller |
| `-NoPause` | 失败时也不弹出「按任意键继续」 |

## 产物

```text
output/Report Editor-Setup-<version>-x64.exe
```

打包成功后脚本会自动运行 `publish-portal-release.mjs --only win`：

- 写入/更新 `packaging/updates/latest.json` 中的 **win32-x64**（含 SHA256）
- **保留**同版本下已有的 **darwin-arm64** 条目（便于先 Mac 后 Win 分平台发版）
- 若 Portal 目录已挂载，复制安装包并同步 `latest.json`

手动同步（在仓库根目录）：

```powershell
node packaging\scripts\publish-portal-release.mjs --copy-artifacts --only win
```

仅更新清单、不复制文件：

```powershell
node packaging\scripts\publish-portal-release.mjs --only win
```

## 打包失败：winCodeSign / 符号链接

若日志出现 `Cannot create symbolic link : A required privilege is not held by the client`，说明 electron-builder 在解压 `winCodeSign` 时无法创建符号链接。本项目已通过 **`afterPack` + `rcedit`** 写入 exe 图标，并关闭 `signAndEditExecutable`，**不应再下载 winCodeSign**。

若仍出现该错误，请确认已拉取最新代码并执行 `npm ci`；或删除缓存 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 后重试。

## 打包失败：npm ci / EBADENGINE

`frontend/package.json` 声明 `engines.node` 为 `>=20 <24`。若打包机安装 **Node.js 24+**，旧版脚本会在 `npm ci` 阶段以 `EBADENGINE` 退出。

**处理：** 拉取最新 `packaging/windows/build.ps1`（Node 24+ 会自动追加 `--ignore-engines`），或改用 [Node.js 22 LTS](https://nodejs.org/)。

## 打包失败：vite build 只打印 Node 版本

Windows 默认堆内存不足时 Vite 可能静默崩溃。脚本已设置 `NODE_OPTIONS=--max-old-space-size=8192`；若仍失败请换 Node 22 LTS 并重试。

（可选）在 Windows **设置 → 系统 → 开发者选项** 中开启 **开发人员模式**，也可允许创建符号链接。

现场安装与卸载见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
