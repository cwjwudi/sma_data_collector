# 安装包打包（packaging）

桌面版 **SD SMA Report Editor** 的发布构建：与 `frontend/`、`backend/` 源码分离，产物写入各平台 `output/`（不入库）。

开发启停见 [../scripts/README.md](../scripts/README.md)。工程总览见 [../README.md](../README.md)。

---

## 文档导航

| 我想… | 去看 |
|--------|------|
| **Windows 一键打 Setup.exe** | [windows/README.md](windows/README.md) → `packaging\windows\build.bat` |
| **macOS 一键打 DMG** | [mac/README.md](mac/README.md) → `packaging/mac/build.sh` 或双击 `build.command` |
| **现场怎么装 / 怎么卸** | [windows-installer.md](../getting-started/windows-installer.md) · [mac-installer.md](../getting-started/mac-installer.md) |
| **手动 npm、镜像、排错** | 下文 [手动 npm 打包](#手动-npm-打包) · [Windows 排错](#windows-排错) |

---

## 目录

```text
packaging/
├── README.md           ← 本说明（打包详述入口）
├── windows/
│   ├── build.bat / build.ps1
│   ├── output/         ← 正式 NSIS 安装包（git 忽略）
│   └── output-alt/     ← 备用输出（占用 release 时排错，git 忽略）
└── mac/
    ├── build.sh / build.command
    └── output/         ← DMG 与 mac-arm64 解包目录（git 忽略）
```

### 遗留的 `frontend/release*` 目录

早期默认输出在 `frontend/release`、`frontend/release-mac` 等。**现已统一写入 `packaging/*/output`**。

若本地仍有旧目录，**先迁移再删**（在 `frontend/` 下执行）：

```bash
# macOS / Linux：搬到 packaging/windows/output、packaging/mac/output 等
npm run migrate:legacy-release

# Windows
npm run migrate:legacy-release:win

# 确认 packaging/*/output 已有内容后再删 frontend/release*（可选）
npm run clean:legacy-release
```

| 旧目录 | 迁移目标 |
|--------|----------|
| `frontend/release-mac/` | `packaging/mac/output/`（`.dmg`、`mac-arm64/` 等） |
| `frontend/release/` | `packaging/windows/output/` |
| `frontend/release-alt/` | `packaging/windows/output-alt/` |

若 `release-mac` 已被删除且未备份，只能重新打包：`./packaging/mac/build.sh`。

---

## 快速开始

> **发版前**在 `_Prj/SD_SMA_ReportEditor` 执行 `git pull origin main`，确认 `frontend/package.json` 的 `version` 为目标版本（当前 **0.2.2**）。打包脚本读取该字段，未 pull 时会仍显示旧版（如 0.2.1）。

| 平台 | 命令 | 产物 |
|------|------|------|
| **Windows** | `packaging\windows\build.bat -Fresh` | `packaging\windows\output\Report Editor-Setup-<version>-x64.exe` + `latest.yml` |

Windows 发版后运行 `publish-portal-release.mjs --only win`（`build.ps1` 已自动调用），将 `latest.json` 的 **notes** 写入 Portal 的 `latest.yml` **releaseNotes**，应用内更新可看到本版说明。
| **macOS** | `./packaging/mac/build.sh --fresh` | `packaging/mac/output/Report Editor-<version>-<arch>.dmg` |

### Windows 参数（`build.ps1`）

| 参数 | 作用 |
|------|------|
| `-Fresh` | 清空 `output/` 后再打包 |
| `-SkipFrontendInstall` | 跳过 `npm ci` |
| `-SkipBackendBuild` | 跳过 PyInstaller |
| `-PortalDir` | 打包完成后同步到 Portal（或设 `REPORT_EDITOR_PORTAL_DIR`） |

### macOS 参数（`build.sh`）

| 参数 | 作用 |
|------|------|
| `--fresh` | 清空 `output/` |
| `--skip-frontend-install` | 跳过 `npm ci` |
| `--skip-backend-build` | 跳过 PyInstaller |
| `--arch arm64` / `--arch x64` | 指定 CPU |

macOS 须在 **Darwin** 上构建。若报 `bad interpreter: /bin/bash^M`：

```bash
perl -pi -e 's/\r\n/\n/g' packaging/mac/build.sh packaging/mac/build.command
```

---

## 手动 npm 打包

推荐仍优先用上一节 **`packaging/windows`** / **`packaging/mac`** 脚本（已串联 PyInstaller + electron-builder + `output/` 路径）。

### Windows

前置：Windows x64、Node.js LTS、Python 3.10+（含 `py` 启动器）。

```powershell
cd frontend
npm install
npm.cmd run dist:win:cn:installer    # 仅 NSIS 安装程序 → packaging/windows/output/
npm.cmd run dist:win:cn              # 安装包 + 便携版（默认 frontend/release/）
npm.cmd run dist:cn                  # 仅 Electron（需已有 backend/dist/report_backend/）
```

内网可设镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm.cmd run dist:win:cn
```

单独重建后端：

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File scripts/build-backend-exe.ps1
```

**成品说明**

- **NSIS**：`SD SMA Report Editor-Setup-<version>-x64.exe` — 设置中可卸载
- **便携版**：`SD SMA Report Editor-Portable-<version>-x64.exe`
- 用户数据：`%APPDATA%\sd-sma-report-editor\`（**主动卸载**时删除；应用内升级应保留；迁移请先导出配置包）

### macOS

```bash
cd frontend
npm install
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/   # 可选
npm run dist:mac:installer
```

用户数据：`~/Library/Application Support/sd-sma-report-editor/`（彻底卸载请删该目录）。

单独重建后端：

```bash
cd backend
bash scripts/build-backend-exe.sh
```

---

## Windows 排错

`winCodeSign` 下载已在 `package.json` 的 `build.win` 中关闭；**Electron 本体**仍可能从 GitHub 拉取，失败时用上文 `ELECTRON_MIRROR` 或 `dist:win:cn`。

| 现象 | 处理 |
|------|------|
| `npm failed: run build` / 日志末尾只有 `Node.js v24.x` | 多为 **Vite 内存不足**；拉最新 `build.ps1`（已设 8GB 堆）或安装 **Node 22 LTS**（勿用 24 Current）后重试 |
| `win-unpacked` 被占用 / Cursor 锁住 | `npm.cmd run dist:cn:alt` → 产物在 `packaging/windows/output-alt/`；清理：`npm.cmd run clean:release:alt` |
| NSIS `Plugin not found … UAC::_` | 关闭占用后 `npm.cmd run clean:eb-cache`，再 `dist:cn:alt`；或暂用 `dist:cn:portable`（无 NSIS） |
| 安装版 / 便携版白屏 | `vite.config.js` 已设 `base: './'`，需 **重新** `build` + `electron-builder` |
| 双击报 `require is not defined` | 拉最新代码后重新 `dist:cn:alt`，勿用旧目录里生成的 exe |
| `app.asar` Access denied | `npm.cmd run clean:release`（清理 `packaging/windows/output`）；或 `dist:cn:alt` + Reload Cursor |

PowerShell 若拦截 `npm.ps1`，统一用 **`npm.cmd`**。

---

## 相关文档

- [windows/README.md](windows/README.md) — Windows 脚本说明
- [mac/README.md](mac/README.md) — macOS 脚本说明
- [getting-started/windows-installer.md](../getting-started/windows-installer.md) — 现场安装与卸载
- [getting-started/mac-installer.md](../getting-started/mac-installer.md) — 现场安装与卸载
