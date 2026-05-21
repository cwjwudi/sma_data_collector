# Windows 打包工具

在 **Windows x64** 上生成 NSIS 安装程序，产物写入本目录 **`output/`**。

← 打包总览与排错：[../README.md](../README.md)

## 运行

```bat
cd packaging\windows
build.bat
```

## 参数（传给 build.ps1）

| 参数 | 作用 |
|------|------|
| `-Fresh` | 清空 `output/` 后再打包 |
| `-SkipFrontendInstall` | 跳过 `npm ci` |
| `-SkipBackendBuild` | 跳过 PyInstaller |

## 产物

```text
output/SD SMA Report Editor-Setup-<version>-x64.exe
```

安装包与 `win-unpacked/` 均在 **`output/`**；排错备用目录为 **`output-alt/`**（见 `npm run dist:cn:alt`），不在 `frontend/release*`。

## 打包失败：winCodeSign / 符号链接

若日志出现 `Cannot create symbolic link : A required privilege is not held by the client`，说明 electron-builder 在解压 `winCodeSign` 时无法创建符号链接。本项目已通过 **`afterPack` + `rcedit`** 写入 exe 图标，并关闭 `signAndEditExecutable`，**不应再下载 winCodeSign**。

若仍出现该错误，请确认已拉取最新代码并执行 `npm ci`；或删除缓存 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 后重试。

（可选）在 Windows **设置 → 系统 → 开发者选项** 中开启 **开发人员模式**，也可允许创建符号链接。

现场安装与卸载见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
