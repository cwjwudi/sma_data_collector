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

现场安装与卸载见 [getting-started/windows-installer.md](../../getting-started/windows-installer.md)。
