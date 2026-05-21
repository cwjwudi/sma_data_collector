# electron-builder 安装包资源

| 文件 | 说明 |
|------|------|
| `icon.png` | 应用图标（1024×1024）；打包时自动生成 `.ico` / `.icns` |
| `installer.nsh` | NSIS 自定义脚本：卸载前结束主程序与后端进程 |

`package.json` → `build.icon` 已指向 `build/icon.png`。

**更换图标：** 源图可以是任意比例。脚本会**居中裁切**为正方形（不拉伸、不补黑/白边），再缩放到 1024×1024：

```bash
bash frontend/scripts/make-app-icon.sh /path/to/your-logo.png
```

然后重新打包即可。
