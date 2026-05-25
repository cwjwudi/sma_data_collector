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
| `--fresh` | 清空 `output/` 后再打包 |
| `--skip-frontend-install` | 跳过 `npm ci` |
| `--skip-backend-build` | 跳过 PyInstaller |
| `--arch arm64` / `--arch x64` | 指定 CPU 架构 |

## 产物

```text
output/Report Editor-<version>-<arch>.dmg
```

打包成功后脚本会自动运行 `publish-portal-release.mjs`：生成 `latest.json`（含 SHA256）并同步到已挂载的 Portal 目录（如 `/Volumes/web/web-portal-demo/...`）。

手动同步：

```bash
node packaging/scripts/publish-portal-release.mjs --copy-artifacts
```

现场安装见 [getting-started/mac-installer.md](../../getting-started/mac-installer.md)。

**经微信发给同事测试**若提示「已损坏」：多为隔离标记 + 未签名，不是文件坏。请同事执行 `xattr -cr "/Applications/SD SMA Report Editor.app"` 或 **右键 → 打开**。详见安装文档第五节。
