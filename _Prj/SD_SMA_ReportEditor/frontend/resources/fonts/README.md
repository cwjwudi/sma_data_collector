# 随包开源 CJK 字体

| 文件 | UI 族名 | 许可 | 用途 |
|------|---------|------|------|
| `NotoSansSC-Regular.ttf` | **Noto Sans SC**（默认） | SIL OFL | pdf-lib 嵌入（须 TTF；OTF/CFF subset 会乱码）+ Mini `@font-face` |
| `ZhuqueFangsong-Regular.ttf` | **FangSong**（自带） | SIL OFL | 仿宋；物理字体为[朱雀仿宋](https://github.com/TrionesType/zhuque)，**非**微软仿宋 |

- **禁止**：勿将微软雅黑 / 微软仿宋 / 宋体等系统字体放入本目录。
- 历史残留的 `NotoSansSC-Regular.otf` 可删；打包与运行时优先 TTF。

## 获取字体文件

在 `frontend` 目录执行（需网络）：

```powershell
npm run fonts:fetch
```

成功后应存在上述两个 **TTF** 文件（git 不入库，仅本机/打包机）。

`npm run build` / `prebuild` 会自动拉取（已存在则跳过）。打包经 `extraResources` 打进安装包 `resources/fonts/`。
