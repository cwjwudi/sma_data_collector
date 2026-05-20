# 安装包打包（packaging）

桌面版 **SD SMA Report Editor** 的发布构建工具与产物目录，与 `frontend/`、`backend/` 源码分离。

```text
packaging/
├── README.md           ← 本说明
├── windows/            ← 在 Windows 上打 NSIS Setup.exe
│   ├── build.bat
│   ├── build.ps1
│   └── output/         ← 安装包输出（不入库）
└── mac/                ← 在 macOS 上打 DMG
    ├── build.sh
    ├── build.command   ← Finder 双击
    └── output/         ← 安装包输出（不入库）
```

## 快速开始

| 平台 | 命令 | 产物目录 |
|------|------|----------|
| **Windows** | `packaging\windows\build.bat` | `packaging\windows\output\` |
| **macOS** | `./packaging/mac/build.sh` 或双击 `build.command` | `packaging/mac/output/` |

开发启停脚本见 [../scripts/README.md](../scripts/README.md)。

## 文档

- [windows/README.md](windows/README.md) — Windows 打包参数与排错
- [mac/README.md](mac/README.md) — macOS 打包参数与排错
- [../getting-started/windows-installer.md](../getting-started/windows-installer.md) — 现场安装/卸载
- [../getting-started/mac-installer.md](../getting-started/mac-installer.md) — 现场安装/卸载
