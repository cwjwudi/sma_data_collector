# 随包开源 CJK 字体

| 文件 | UI 族名 | 许可 | 用途 |
|------|---------|------|------|
| `ZhuqueFangsong-Regular.ttf` | **FangSong**（矢量默认） | SIL OFL | pdf-lib subset 可用；物理字体为[朱雀仿宋](https://github.com/TrionesType/zhuque)，**非**微软仿宋 |
| `NotoSansSC-Regular.ttf` / `.otf` | **Noto Sans SC** | SIL OFL | 供 UI/预检；**勿**对 TTF/VF 做 pdf-lib subset（macOS Preview 缺字乱距）；OTF 为 OTTO 亦不可 subset |

- **禁止**：勿将微软雅黑 / 微软仿宋 / 宋体等系统字体放入本目录。
- 2026-07-22：矢量档与 Mini 空族名统一走 **FangSong**，避免 Noto subset 缺陷。

## 获取字体文件

在 `frontend` 目录执行（需网络）：

```powershell
npm run fonts:fetch
```

成功后应存在上述两个 **TTF** 文件（git 不入库，仅本机/打包机）。

`npm run build` / `prebuild` 会自动拉取（已存在则跳过）。打包经 `extraResources` 打进安装包 `resources/fonts/`。
