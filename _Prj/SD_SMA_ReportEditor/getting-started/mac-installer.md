# macOS 安装包 — 打包、安装与卸载

面向 **SD SMA Report Editor**（Electron 桌面版）在 **macOS** 上的交付：生成 **DMG**，用户拖入「应用程序」即可使用。

> **必须在 Mac 上打包**（无法在 Windows 上交叉编译出可用的 `.app` / `.dmg`）。

---

## 一、在 Mac 上打包

### 环境要求

| 软件 | 说明 |
|------|------|
| macOS 12+（推荐） | 打包机为 Apple Silicon 或 Intel Mac |
| Xcode Command Line Tools | `xcode-select --install` |
| Node.js LTS | 20.x / 22.x（`brew install node`） |
| Python 3.10+ | `brew install python@3.12` |
| 磁盘空间 | 建议 ≥ 4 GB |

### 一键打包（推荐）

在 **`SD_SMA_ReportEditor/packaging/mac/`**：

```bash
chmod +x build.sh build.command
./build.sh
```

或在 Finder 中 **双击** `packaging/mac/build.command`。

项目根 `build_mac_installer.sh` / `build_mac_installer.command` 会转发到上述目录。

> 若终端报 `bad interpreter: /bin/bash^M`，对 `packaging/mac/*.sh` 执行：  
> `perl -pi -e 's/\r\n/\n/g' packaging/mac/build.sh packaging/mac/build.command`

可选参数：

| 参数 | 作用 |
|------|------|
| `--fresh` | 打包前清空 `packaging/mac/output/` |
| `--skip-frontend-install` | 跳过 `npm ci` |
| `--skip-backend-build` | 跳过 PyInstaller（需已有 `backend/dist/report_backend/report_backend`） |
| `--arch arm64` | 指定架构（Apple Silicon 默认） |
| `--arch x64` | Intel Mac 安装包 |

**产物示例：**

```text
packaging/mac/output/SD SMA Report Editor-0.1.0-arm64.dmg
```

（版本与架构随 `package.json` 的 `version` 及 `--arch` 变化。）

### 等价 npm 命令

```bash
cd frontend
npm install
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/   # 可选，国内镜像
npm run dist:mac:installer
```

仅打当前机器架构的 DMG 时，也可在 `frontend/` 执行：

```bash
npm run build:backend:mac && npm run build
npx electron-builder --mac dmg --arm64 --config.directories.output=../../packaging/mac/output
```

（Intel Mac 将 `--arm64` 改为 `--x64`。）

---

## 二、现场安装（最终用户）

1. 将 **`.dmg`** 拷贝到目标 Mac。
2. 双击打开 DMG，将 **SD SMA Report Editor** 拖入 **应用程序**。
3. 首次启动若提示「无法打开」或「来自未知开发者」：
   - **右键**应用 → **打开** → 确认；或
   - 终端执行：`xattr -cr "/Applications/SD SMA Report Editor.app"`
4. 用户数据目录（与程序分离）：

```text
~/Library/Application Support/sd-sma-report-editor/backend-data/
```

（数据库/OPC 配置、`config.json`、模版等。）

> 正式对外分发建议配置 **Apple 开发者签名与公证（notarization）**；内网试用可用右键打开方式。

---

## 三、卸载与「干净重装」

1. 将 **应用程序** 中的 **SD SMA Report Editor** 移到废纸篓。
2. 若需清空配置与模版，删除：

```text
~/Library/Application Support/sd-sma-report-editor/
```

删除上述文件夹后，再安装新 DMG 即为空白环境。迁移配置请先用 **设置 → 配置导入/导出 → 导出（本机备份）**。

---

## 四、与 Windows 安装包的差异

| 项目 | Windows | macOS |
|------|---------|--------|
| 交付物 | `Setup.exe`（NSIS） | `.dmg` |
| 安装 | 安装向导 | 拖入应用程序 |
| 后端二进制 | `report_backend.exe` | `report_backend` |
| 用户数据 | `%APPDATA%\sd-sma-report-editor\` | `~/Library/Application Support/sd-sma-report-editor/` |
| 卸载删数据 | 卸载程序自动删除 | 需手动删 Application Support |

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| PyInstaller 失败 | 在 `backend` 执行 `bash scripts/build-backend-exe.sh` 查看报错；确认 venv 与 `requirements-dev.txt` |
| Electron 下载慢 | `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重试 |
| 打开应用后无后端 | 确认 DMG 由最新代码打包（`main.cjs` 在 Mac 上使用 `report_backend` 而非 `.exe`） |
| 窗口白屏 | 重新打包（`vite.config.js` 中 `base: './'`） |

更多开发启动说明见 [mac.md](mac.md)；Windows 打包见 [windows-installer.md](windows-installer.md)。
