# ReportEditor：矢量导出 · 页眉仅封面有、正文页无

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**（与 `frontend/package.json` / Portal Setup 一致）。  
> **范围**：导出档 **1「矢量版式」**（`layout-v2`）。  
> **关联**：[036](036-✅-ReportEditor矢量档与预览稳样式对照.md) · [035](035-🚧-ReportEditor导出性能档位与同机降载.md)。

---

# 🚧 进行中：现象与根因排查

## 现象

- 矢量导出：封面有页眉内容。  
- **后续正文页没有页眉**（用户期望正文也带同一套页眉，或预览里正文曾有页眉）。

## 代码根因（本机已核对路径）

`pdf-lib-layout-v2-render.ts` → `paintPage`：

| 纸面 | 页眉数组 |
|------|----------|
| cover | `tmpl.coverHeaderElements` |
| body | `tmpl.headerElements` |
| back | `tmpl.backHeaderElements` |

封面与正文页眉在数据模型上 **完全独立**（版式应用到封面只写 `coverHeader*`；应用到正文只写 `header*`，见 `layout-apply.ts`）。  
Mini / Chromium 导出同样按 sheet 取对应数组（`TemplateMiniBands` / `TemplateBodyCanvas`），**不是矢量独有分支**。

### 假设优先级

| ID | 假设 | 说明 |
|----|------|------|
| H1 | 模板数据：仅封面有眉 | `coverHeaderElements.length > 0` 且 `headerElements` 空 → 封面有、正文无；档 2 也应如此 |
| H2 | SQL 续页藏 chrome | `showChrome = !card.continuationHideOtherBodyElements && !card.tailOnlyBelowBaseline`；续页可能不画眉脚 |
| H3 | 正文绑了另一版式 / 眉带高度 0 | `layoutSnapshot.headerBandMm === 0` 时灰底不画，但元素仍应 `drawZoneElements`；需看是否被夹到不可见区 |
| H4 | 误以为封面眉会继承到正文 | 产品未做「封面眉同步正文」；属预期认知差，不是渲染漏画 |

若 **仅矢量无、档 2 有** 正文页眉，则超出上表，需另查矢量 `cards` / `showChrome` 与 Chromium DOM 差异（优先抓同戳 PDF）。

## 本机复现思路

1. 构造模板：`coverHeaderElements=[标题]`，`headerElements=[]`，有 body → 矢量封面有眉、正文无眉（**H1 复现**）。  
2. 再设 `headerElements` 与封面同内容 → 正文应出现眉（验证渲染通路正常）。  
3. 大 SQL 分卡：看续页是否 `continuationHideOtherBodyElements`（**H2**）。

## 建议修复方向

| 若确认 | 做法 |
|--------|------|
| H1 / H4 | 产品：模版编辑提示「封面/正文/封尾页眉各自独立」；或提供「将封面页眉复制到正文」一键 |
| H2 | 与 Mini 对齐：续页是否应保留眉脚；改 `showChrome` 条件或续页策略 |
| H3 | 校正正文 `headerBandMm` / zone 原点；保证眉带高度 ≥ 控件 |
| 仅矢量差 | 对照 `appendPdfLibLayoutV2Pages` 与 `PdfExportView` 分页卡片字段 |

## 需要补充的信息

| # | 请提供 |
|---|--------|
| 1 | 准确版本号；模板 ID / 导出 JSON |
| 2 | 同一次导出的档 1 + 档 2 PDF（或预览截图：正文页是否有眉） |
| 3 | JSON：`coverHeaderElements` / `headerElements` 长度与摘要；正文 `layoutSnapshot.headerBandMm` |
| 4 | 无眉的是「第一张正文」还是「SQL 撑开的第 2+ 张」 |
| 5 | 封面/正文是否绑了不同版式预设 |

---

# ⌛️ 未完成：按样本定性后修复并验收

- [ ] 用档 2 对照判定 H1–H4  
- [ ] 修复或产品补齐（复制眉 / 续页策略）  
- [ ] 验收：期望纸面均有眉；续页行为与预览一致  
