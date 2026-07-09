# macOS 打包工具

在 **macOS** 上生成 DMG，产物写入本目录 **`output/`**。

← 打包总览：[../README.md](../README.md)

## 运行

```bash
cd packaging/mac
chmod +x build.sh build.command
./build.sh
```

或双击本目录 `build.command`（在「终端.app」中按 Enter 后会自动关窗；在 Cursor / VS Code 集成终端中需手动关闭标签页）。

## 参数

| 参数 | 作用 |
|------|------|
| `--fresh` | 仅清理当前版本产物后重打；保留历史 `.dmg` |
| `--skip-frontend-install` | 跳过 `npm ci` |
| `--skip-backend-build` | 跳过 PyInstaller |
| `--arch arm64` / `--arch x64` | 指定 CPU 架构 |
| `--version <semver>` | 打包前自动 bump（写 `package.json` + `latest.json`） |
| `--notes <text>` | 与 `--version` 写入 manifest 说明 |

**推荐一发版命令**（避免打出旧版本号安装包）：

```bash
./build.sh --version 0.1.25 --notes "更新说明" --fresh
```

也可先手动 bump，再 `./build.sh`：

```bash
node packaging/scripts/bump-version.mjs <版本号> --notes "更新说明"
```

若 `package.json` 与 `latest.json` 版本不一致，脚本会**报错退出**（可用 `--allow-version-mismatch` 仅警告）。产物文件名必须为 `Report Editor-<version>-<arch>.dmg`。

脚本会执行 `npm test`、Vite 构建、DMG 打包，并调用 `publish-portal-release.mjs --only mac`（**保留** `latest.json` 中同版本的 `win32-x64` 条目）。

## 产物

```text
output/Report Editor-<version>-<arch>.dmg
```

打包成功后脚本会自动运行 `publish-portal-release.mjs`：生成 `latest.json`（含 SHA256）并同步到已挂载的 Portal 目录（如 `/Volumes/web/web-portal-demo/...`）。

手动同步：

```bash
node packaging/scripts/publish-portal-release.mjs --copy-artifacts --only mac
```

现场安装见 [getting-started/mac-installer.md](../../getting-started/mac-installer.md)。

**经微信发给同事测试**若提示「已损坏」：多为隔离标记 + 未签名，不是文件坏。请同事执行 `xattr -cr "/Applications/SD SMA Report Editor.app"` 或 **右键 → 打开**。详见安装文档第五节。
