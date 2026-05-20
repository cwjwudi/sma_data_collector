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
| **macOS** | `./packaging/mac/build.sh` | `packaging/mac/output/` |

项目根目录仍保留 **快捷入口**（转发到上述路径）：

- `build_windows_installer.bat`
- `build_mac_installer.sh` / `build_mac_installer.command`

## 文档

- [windows/README.md](windows/README.md) — Windows 打包参数与排错
- [mac/README.md](mac/README.md) — macOS 打包参数与排错
- [../getting-started/windows-installer.md](../getting-started/windows-installer.md) — 现场安装/卸载
- [../getting-started/mac-installer.md](../getting-started/mac-installer.md) — 现场安装/卸载
