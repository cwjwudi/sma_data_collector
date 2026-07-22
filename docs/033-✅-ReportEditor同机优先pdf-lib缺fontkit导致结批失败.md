# ReportEditor：同机优先（pdf-lib）缺 fontkit → OPC 自动结批失败

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-22 · 现场 Win **0.3.115**。  
> **落地版本**：**0.3.116**（fontkit）· **0.3.117**（仿宋随包 + ERR_FAILED 加固）· [Plan 116](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.116.md) · [Plan 117](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.117.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

# ✅ 已完成：登记报错与根因（2026-07-22）

## 现象

OPC UA 自动结批：`PDFDocument.embedFont` 报缺 `fontkit`；部分绑定伴随 `ERR_FAILED` 加载导出页。

## 根因

| # | 结论 | 置信度 |
|---|------|--------|
| **1 主因** | 嵌入随包 Noto + `subset:true` 未 `registerFontkit` / 未依赖 `@pdf-lib/fontkit` | **高** |
| **2 放大器** | 多绑定并发导致导出窗 `ERR_FAILED` | **中高** |

---

# ✅ 已完成：产品确认（2026-07-22）

| ID | 决议 |
|----|------|
| Q1 | 默认字体 = **Noto Sans SC**，软件自带 |
| Q2 | **A**：空值占位显示 `Noto Sans SC（默认）`，不写死进模版 |
| Q3 | 下拉置顶并标「默认」 |
| Q4 | 0.3.116 只修 fontkit；`ERR_FAILED` 加固 → **0.3.117** |
| Q5 | fontkit 修 → **0.3.116** |
| Q6 | 仿宋也做成默认自带 → **0.3.117**（朱雀仿宋 OFL，UI 族名 `FangSong`） |

---

# ✅ 已完成：0.3.116 修复（fontkit）

1. 依赖 `@pdf-lib/fontkit`；`pdf-lib-export-render` 在 `embedFont` 前 `registerFontkit`。  
2. 字体 UI：占位 / 下拉「Noto Sans SC（默认）」；`DEFAULT_LAYOUT_FONT_FAMILY`。  
3. `npm run fonts:fetch` + `prebuild` 自动拉取 OTF；`extraResources` 打进安装包。  
4. 单测：`pdf-lib-fontkit.test.ts`。

---

# ✅ 已完成：0.3.117（仿宋随包 + ERR_FAILED 加固）

1. **仿宋自带**：随包 `ZhuqueFangsong-Regular.ttf`（朱雀仿宋 / OFL）；UI 与模版族名仍用 `FangSong`（**非**微软仿宋）。下拉置顶标「自带」。  
2. `fonts:fetch` → `fetch-bundled-fonts.mjs`（Noto + 朱雀）；IPC `bundled-cjk-font` 支持 `key`/`family`；导出按模版字体择嵌入。  
3. **ERR_FAILED 加固**：`navigatePdfExportWindowWithRecovery`——可恢复导航错误时销毁隐藏窗并冷启动重试一次；热切换兜底同样可重建。  
4. 单测：字体可用性 / nav-recovery。

## 验收

- [x] 契约：依赖 + `registerFontkit` 源码门禁  
- [x] FangSong `coveredByBundle`；`fonts:fetch` 写出朱雀 TTF  
- [x] `isRecoverablePdfExportNavError` 覆盖 `ERR_FAILED (-2)`  
- [ ] 手测 Win：同机优先自动结批不再 fontkit 报错；`fontEmbedded: true`  
- [ ] 手测：属性选 FangSong 导出嵌入成功；多绑定并行不再因单次 `ERR_FAILED` 整批挂死（可恢复路径）  

---

# ⌛️ 未完成（本看板无）

（ERR_FAILED 加固已随 0.3.117 落地；现场手测仍开。）
