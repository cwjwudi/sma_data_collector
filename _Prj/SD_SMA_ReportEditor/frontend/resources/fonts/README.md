# 随包开源 CJK 字体（Noto Sans SC）

- **用途**：pdf-lib 导出嵌入；预检回退族名 `Noto Sans SC`。
- **许可**：SIL Open Font License（可随应用再分发）。
- **禁止**：勿将微软雅黑 / 宋体等系统字体放入本目录。

## 获取字体文件

在仓库根或本目录执行（需网络）：

```powershell
# 在 frontend 目录
npm run fonts:fetch

# 或
node ..\packaging\scripts\fetch-noto-sans-sc.mjs
```

成功后应存在：`NotoSansSC-Regular.otf`（git 不入库，仅本机/打包机）。

`npm run build` / `prebuild` 会自动拉取（已存在则跳过）。打包经 `extraResources` 打进安装包 `resources/fonts/`。
