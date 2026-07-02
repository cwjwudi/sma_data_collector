# web-portal-demo

BR-Portal 静态资源演示目录（与 [brportal.cpolar.top](https://brportal.cpolar.top/) 部署结构对齐）。

## Report Editor 0.1.25（Windows）

| 路径 | 说明 |
|------|------|
| `public/downloads/report-editor/latest.json` | 应用内自动更新清单（含 SHA256） |
| `public/downloads/report-editor/latest.yml` | Windows NSIS 增量更新（electron-updater） |
| `public/downloads/report-editor/Report Editor-Setup-0.1.25-x64.exe` | 安装包（**不入 Git**，见 `.gitignore`） |
| `public/downloads/report-editor/*.blockmap` | 差分更新 blockmap |
| `public/downloads/report-editor/index.html` | 浏览器下载说明页（读取 `latest.json`） |

**更新说明（0.1.25）：** OPC UA 自动截批在任意页面持续监听，离开生成报表页仍可保存 PDF。

## 重新发布 Windows 包

在 `_Prj/SD_SMA_ReportEditor` 下：

```bat
cd packaging\windows
build.bat -Fresh -NoPause
```

同步到本目录：

```powershell
node packaging/scripts/publish-portal-release.mjs --copy-artifacts --only win --portal-dir ../../web-portal-demo/public/downloads/report-editor
```

Solutions 页（`/solutions`）上的「当前最新版本」需在 Portal 仓库 `config/solutions.php` 的 `app_downloads` 块中改为 **0.1.25**；本目录仅负责 `/downloads/report-editor/` 静态更新源。
