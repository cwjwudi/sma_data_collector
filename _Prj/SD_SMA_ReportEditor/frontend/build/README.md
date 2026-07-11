# electron-builder 安装包资源

| 文件 | 说明 |
|------|------|
| `icon.png` | 应用图标（1024×1024）；macOS 打包时自动生成 `.icns` |
| `icon.ico` | Windows 专用多尺寸图标；安装包、exe、任务栏均使用此文件 |
| `installer.nsh` | NSIS 自定义脚本：卸载前结束进程；**主动卸载**时删除 AppData（升级覆盖安装时保留） |

`package.json` → `build.icon` 指向 `build/icon.png`；Windows 目标额外指定 `build/icon.ico`。

**Report Editor AI（0.3.19+）** 图标：青绿霓虹边框 + 六边形光晕 + 大号青橙渐变 **AI** 角标 + 星芒，与原版深蓝「纸张+图表+铅笔」一眼可辨。

**更换图标：** 源图可以是任意比例。脚本会**居中裁切**为正方形（不拉伸、不补黑/白边），再缩放到 1024×1024：

```bash
bash frontend/scripts/make-app-icon.sh /path/to/your-logo.png
```

然后重新打包即可。
