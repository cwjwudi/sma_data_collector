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

也可双击 `packaging/mac/build.command`。

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
3. 首次启动若提示「无法打开」「来自未知开发者」或 **「已损坏，无法打开」**（见下文「微信/网盘分发」）：
   - **右键**应用 → **打开** → 再点 **打开**（不要用双击）；或
   - 终端执行（去掉隔离标记，路径按实际安装位置修改）：
     ```bash
     xattr -cr "/Applications/SD SMA Report Editor.app"
     ```
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

## 五、微信 / 网盘分发：「已损坏，无法打开」

同事测试时若出现 **「"SD SMA Report Editor.app" 已损坏，无法打开。你应该将它移到废纸篓。」**，且系统提示文件由 **微信** 等创建，**多数不是包真的坏了**，而是：

1. **未做 Apple 代码签名与公证**（当前内网试用包如此），Gatekeeper 会拦截；
2. 经 **微信直接传 `.app` 或解压后的应用**，macOS 会打上 **隔离属性**（`com.apple.quarantine`），常表现为「已损坏」。

**不要点「移到废纸篓」**（除非确认文件传输不完整）。

### 给测试同事（任选一种）

**方法 A — 右键打开（最简单）**

1. 在 Finder 中找到 `SD SMA Report Editor.app`（建议在「应用程序」里）。
2. **按住 Control 键点击**（或右键）→ **打开**。
3. 在对话框中点 **打开**（不是「移到废纸篓」）。
4. 首次成功后，之后一般可正常双击。

**方法 B — 终端去掉隔离（推荐，适合微信收到的包）**

```bash
xattr -cr "/Applications/SD SMA Report Editor.app"
```

若应用还在下载目录，把路径改成实际位置，例如：

```bash
xattr -cr ~/Downloads/SD\ SMA\ Report\ Editor.app
```

然后再双击或右键打开。

**方法 C — 系统设置**

「系统设置」→ **隐私与安全性** → 若出现「仍要打开」或关于该应用的提示，点 **仍要打开**。

### 给打包同事（减少踩坑）

| 建议 | 说明 |
|------|------|
| **优先发 `.dmg`** | 从 `packaging/mac/output/*.dmg` 发送；同事挂载后拖入「应用程序」，比直接发 `.app` 稳 |
| **避免微信直传 `.app`** | 易触发隔离/损坏提示；若必须用微信，请同事用上面的 **xattr** 或 **右键打开** |
| **更稳的传输** | U 盘、局域网共享、企业网盘、**zip 压缩包**（微信发 zip 往往比裸 `.app` 好） |
| **架构要匹配** | Apple Silicon 包（`arm64`）在 Intel Mac 上可能无法运行；Intel 同事需要 `--arch x64` 重打 |
| **长期方案** | 注册 Apple Developer，对 `.app` **签名 + 公证（notarization）** 后再分发，可基本消除此类提示 |

当前工程 **未配置** Developer ID 签名，内网测试按上表处理即可。

---

## 六、其它常见问题

| 现象 | 处理 |
|------|------|
| PyInstaller 失败 | 在 `backend` 执行 `bash scripts/build-backend-exe.sh` 查看报错；确认 venv 与 `requirements-dev.txt` |
| Electron 下载慢 | `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重试 |
| 打开应用后无后端 | 确认 DMG 由最新代码打包（`main.cjs` 在 Mac 上使用 `report_backend` 而非 `.exe`） |
| 窗口白屏 | 重新打包（`vite.config.js` 中 `base: './'`） |
| 微信传输后「已损坏」 | 见上文 **第五节** |

更多开发启动说明见 [mac.md](mac.md)；Windows 打包见 [windows-installer.md](windows-installer.md)。
