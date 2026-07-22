# ReportEditor：同机优先（pdf-lib）缺 fontkit → OPC 自动结批失败

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-22 · 现场 Win **0.3.115**。  
> **落地版本**：**0.3.116** · [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.116.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

# ✅ 已完成：登记报错与根因（2026-07-22）

## 现象

OPC UA 自动结批：`PDFDocument.embedFont` 报缺 `fontkit`；部分绑定伴随 `ERR_FAILED` 加载导出页。

## 根因

| # | 结论 | 置信度 |
|---|------|--------|
| **1 主因** | 嵌入随包 Noto + `subset:true` 未 `registerFontkit` / 未依赖 `@pdf-lib/fontkit` | **高** |
| **2 放大器** | 多绑定并发导致导出窗 `ERR_FAILED` | **中高**（另开加固） |

---

# ✅ 已完成：产品确认（2026-07-22）

| ID | 决议 |
|----|------|
| Q1 | 默认字体 = **Noto Sans SC**，软件自带 |
| Q2 | **A**：空值占位显示 `Noto Sans SC（默认）`，不写死进模版 |
| Q3 | 下拉置顶并标「默认」 |
| Q4 | 本版只修 fontkit；`ERR_FAILED` **修复完成后再修加固** |
| Q5 | **0.3.116** |

---

# ✅ 已完成：0.3.116 修复

1. 依赖 `@pdf-lib/fontkit`；`pdf-lib-export-render` 在 `embedFont` 前 `registerFontkit`。  
2. 字体 UI：占位 / 下拉「Noto Sans SC（默认）」；`DEFAULT_LAYOUT_FONT_FAMILY`。  
3. `npm run fonts:fetch` + `prebuild` 自动拉取 OTF；`extraResources` 打进安装包。  
4. 单测：`pdf-lib-fontkit.test.ts`。

## 验收

- [x] 契约：依赖 + `registerFontkit` 源码门禁  
- [ ] 手测 Win：同机优先自动结批不再 fontkit 报错；`fontEmbedded: true`  
- [ ] 属性面板空字体显示 `Noto Sans SC（默认）`  
- [ ] `ERR_FAILED` 加固 ⌛️（按确认另开）

---

# ⌛️ 未完成：导出窗 ERR_FAILED 加固

多绑定并行时隐藏窗导航失败 → 销毁/重建或串行槽（033 次要，本版不做）。
