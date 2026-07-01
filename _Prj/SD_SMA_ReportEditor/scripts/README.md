# 脚本目录（scripts）

与源码分离的**开发启动**入口。工程总览见根 [README.md](../README.md)。项目根目录不再放置 `.bat` / `.sh` 快捷方式。

```text
scripts/
├── README.md           ← 本说明
└── dev/
    ├── windows/        ← Windows 浏览器模式一键启停
    │   ├── start_dev_web.bat
    │   ├── stop_dev_web.bat / stop_dev_web.ps1
    │   └── install_and_start_dev_web.bat / .ps1
    └── mac/
        └── open-electron-dev-mac.command   ← Finder 双击 Electron 开发

packaging/              ← 安装包打包（见 packaging/README.md）
├── windows/build.bat
└── mac/build.sh / build.command
```

## 开发

| 平台 | 用途 | 入口 |
|------|------|------|
| Windows | Web（浏览器 + 双 PowerShell 窗口） | `scripts\dev\windows\start_dev_web.bat` |
| Windows | 停止 8000 / 5173 | `scripts\dev\windows\stop_dev_web.bat` |
| Windows | 装依赖并启动 Web | `scripts\dev\windows\install_and_start_dev_web.bat` |
| Windows | Electron 一键开发 | `scripts\dev\windows\start_dev_electron.bat` |
| Windows | Electron 开发（Node 24+ 用 Node 22 子进程） | `scripts\dev\start_dev_electron_node22.bat` |
| macOS | Electron 一键开发 | 双击 `scripts/dev/mac/open-electron-dev-mac.command` |

后端 / 前端分脚本仍在 `backend/scripts/`、`frontend/scripts/`（由上述 bat 调用）。

## 打包

见 [packaging/README.md](../packaging/README.md)。
