# 应用内更新发布目录

桌面版「设置 → 软件更新」会请求本目录下的 **`latest.json`**。

## 检测的是哪个目录？

**推荐：P004_WebPortal 静态目录**（无需 Gitea 登录，适合 Electron 自动更新）

| 项目 | 路径 |
|------|------|
| **WebPortal 仓库内** | `P004_WebPortal/public/downloads/report-editor/` |
| **应用内填写的更新源** | `https://你的门户域名/downloads/report-editor` |
| **实际请求** | `{更新源}/latest.json` |

Apache/Nginx 文档根为 `public/` 时，`public/downloads/` 下的文件**匿名可访问**，不经过门户登录。

**备选：Gitea raw**（仓库需允许匿名 raw，否则客户端会 HTTP 404）

| 项目 | 路径 |
|------|------|
| **仓库内** | `_Prj/SD_SMA_ReportEditor/packaging/updates/` |
| **URL** | `https://…/raw/main/…/packaging/updates/latest.json` |

客户端逻辑：读取 `{更新源}/latest.json` → 比较 `version` 与当前安装包版本 → 从 `platforms[本机平台].url` 下载安装包。

若门户地址为 [brportal.cpolar.top](https://brportal.cpolar.top/)，更新源示例：

```
https://brportal.cpolar.top/downloads/report-editor
```

## 打包后文件放哪里？

1. **先打包**（产物在各自 output，不会自动进 updates）  
   - macOS：`packaging/mac/output/Report Editor-<version>-<arch>.dmg`  
   - Windows：`packaging/windows/output/Report Editor-Setup-<version>-x64.exe`

2. **再复制到本目录** `packaging/updates/`（与 `latest.json` 同级）  
   ```bash
   cp "packaging/mac/output/Report Editor-0.1.0-arm64.dmg" packaging/updates/
   ```

3. **生成或更新** `latest.json`（见下方命令）

4. **发布**  
   - 提交并推送 **`latest.json`** 到 Gitea（已纳入 Git）  
   - **安装包**体积大，默认在 `.gitignore` 中；需通过 Gitea 网页上传、Release 附件、内网文件服务器等方式，保证 `latest.json` 里的 `url` 可下载  
   - 若安装包放在其他服务器，生成清单时用 `--base-url` 指向该服务器，或把 `url` 写成绝对地址

## 清单格式

见 [`latest.json.example`](./latest.json.example)。`platforms` 键名：

| 键 | 平台 |
|----|------|
| `win32-x64` | Windows 64 位（NSIS Setup.exe） |
| `darwin-arm64` | macOS Apple Silicon（.dmg） |
| `darwin-x64` | macOS Intel（.dmg） |

`url` 可为相对路径（相对更新源目录）或绝对 URL。建议填写 `sha256` 供客户端校验。

## 生成清单（当前仓库示例）

已根据本机 `packaging/mac/output/Report Editor-0.1.0-arm64.dmg` 生成 **`latest.json`**（版本 0.1.0）。新版本发布时：

```bash
# 1. 复制安装包到 updates/
cp "packaging/mac/output/Report Editor-0.2.0-arm64.dmg" packaging/updates/

# 2. 生成 latest.json（版本号与 package.json 一致）
node packaging/scripts/generate-update-manifest.mjs \
  --version 0.2.0 \
  --notes "更新说明" \
  --base-url "https://brsysnology925gitea.cpolar.top/BRTeam/p000_sd_sma_scada/raw/main/_Prj/SD_SMA_ReportEditor/packaging/updates" \
  --mac-arm64 "packaging/updates/Report Editor-0.2.0-arm64.dmg" \
  --win "packaging/updates/Report Editor-Setup-0.2.0-x64.exe"
```

将生成的 `latest.json` 与对应安装包一并发布，确保清单中的 URL 可访问。

## 清单格式（字段说明）

## 升级行为

| 系统 | 一键升级 |
|------|----------|
| **Windows** | 下载 Setup.exe → 启动安装向导 → 退出当前应用 |
| **macOS** | 下载 .dmg → 打开镜像 → 用户拖入「应用程序」 |

macOS 未签名应用无法静默替换 `.app`，需用户手动拖放。

## 环境变量（打包时可选）

在 `electron-builder` 前设置，可覆盖默认更新源：

```bash
export REPORT_EDITOR_UPDATE_BASE_URL="https://内网/updates"
```
