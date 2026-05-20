# electron-builder 安装包资源

| 文件 | 说明 |
|------|------|
| `installer.nsh` | NSIS 自定义脚本：卸载前结束主程序与后端进程 |
| `icon.ico`（可选） | 应用与安装程序图标，256×256 推荐；无则使用 Electron 默认图标 |
| `icon.png`（可选） | 若提供 PNG，electron-builder 可自动生成 `.ico` |

将 `icon.ico` 放入本目录后，在 `package.json` 的 `build.win` 中增加：

```json
"icon": "build/icon.ico"
```
