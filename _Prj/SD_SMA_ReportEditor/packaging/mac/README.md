# macOS 打包工具

在 **macOS** 上生成 DMG，产物写入本目录 **`output/`**。

← 打包总览：[../README.md](../README.md)

## 运行

```bash
cd packaging/mac
chmod +x build.sh build.command
./build.sh
```

或双击本目录 `build.command`。

## 参数

| 参数 | 作用 |
|------|------|
| `--fresh` | 清空 `output/` 后再打包 |
| `--skip-frontend-install` | 跳过 `npm ci` |
| `--skip-backend-build` | 跳过 PyInstaller |
| `--arch arm64` / `--arch x64` | 指定 CPU 架构 |

## 产物

```text
output/SD SMA Report Editor-<version>-<arch>.dmg
```

现场安装见 [getting-started/mac-installer.md](../../getting-started/mac-installer.md)。
