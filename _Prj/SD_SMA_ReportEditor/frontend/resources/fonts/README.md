# 随包开源 CJK 字体（Noto Sans SC）

- **用途**：pdf-lib 导出嵌入；预检回退族名 `Noto Sans SC`。
- **许可**：SIL Open Font License（可随应用再分发）。
- **禁止**：勿将微软雅黑 / 宋体等系统字体放入本目录。

## 获取字体文件

在仓库根或本目录执行（需网络）：

```powershell
node ..\..\scripts\fetch-noto-sans-sc.mjs
```

成功后应存在：`NotoSansSC-Regular.otf`（或脚本打印的实际文件名）。

打包脚本可在缺文件时自动拉取；体积较大时优先使用子集（脚本内可改 URL）。
