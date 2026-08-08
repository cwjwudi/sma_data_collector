# ReportEditor：矢量导出 · 页眉仅封面有、正文页无

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**（与 `frontend/package.json` / Portal Setup 一致）。  
> **范围**：导出档 **1「矢量版式」**（`layout-v2`）。  
> **关联**：[036](036-✅-ReportEditor矢量档与预览稳样式对照.md) · [035](035-🚧-ReportEditor导出性能档位与同机降载.md)。

---

# ✅ 已完成：H2 修复——矢量续页/尾页漏画页眉页脚（2026-08-08）

## 定性

- Mini / Chromium（`TemplateMiniPage.vue`）：页眉带 `v-if="me.hb > 0"`、页脚带 `v-if="me.fb > 0"`，**不受续页标志影响**；仅正文 zone 装饰用 `miniShowDecorationEls` 在续页/尾页隐藏。  
- 矢量（`pdf-lib-layout-v2-render.ts` · `paintPage`）：旧 `showChrome = !continuationHideOtherBodyElements && !tailOnlyBelowBaseline` 把**页眉、页脚、装饰一并跳过**——SQL/静态表撑开的第 2+ 张正文页只剩灰带无眉脚内容。  
- 且 `zoneBodyDecorRef(tmpl, "body")` 恒返回 `[]`（正文无 zone 装饰）：`showChrome` 在正文续页的唯一实际效果就是吞眉脚，属**纯缺陷**（H2 确认；封面/末页无续页卡不受影响）。

## 修复

- `paintPage`：页眉/页脚 `drawZoneElements` 改为**无条件绘制**（与 Mini/Chromium 对齐）；原条件更名 `showBodyDecor`，仅约束正文 zone 装饰（cover/back 语义不变）。

## 对抗测试

- `pdf-lib-layout-v2-render.test.ts` 新增「041: header/footer are drawn on SQL continuation pages」：40 行静态表撑 2+ 卡，断言**每页**均含页眉文本与 `n/N` 页脚页码；已验证在旧逻辑下第 2 页即红（`page 2 missing header`）。  
- 全量 vitest：**107 文件 / 624 用例全绿**（2026-08-08）。

---

# 🚧 进行中：现象与根因排查（H1/H4 待现场样本）

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

| ID | 假设 | 状态 |
|----|------|------|
| H1 | 模板数据：仅封面有眉（`coverHeaderElements` 有、`headerElements` 空） | ⌛️ 待现场 JSON 判定；若成立属数据/认知差，档 2 也应无正文眉 |
| H2 | SQL 续页藏 chrome（`showChrome` 把眉脚一并跳过） | ✅ **已确认为代码缺陷并修复**（见上方 H2 修复段） |
| H3 | 正文绑了另一版式 / 眉带高度 0 | ⌛️ 待现场 `headerBandMm`；矢量元素绘制不依赖带高>0，仅灰底受影响 |
| H4 | 误以为封面眉会继承到正文 | ⌛️ 若 H1 成立则并入产品提示/一键复制方案 |

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

# ⌛️ 未完成：现场样本对照与剩余定性

- [x] H2 续页漏眉脚：已修复 + 对抗测试（2026-08-08）  
- [ ] 现场重导同模版档 1 PDF：确认「SQL 撑开第 2+ 张」的眉脚恢复  
- [ ] 若第一张正文页也无眉：取模版 JSON 判定 H1（`headerElements` 是否为空）→ 产品提示或「封面眉复制到正文」一键  
- [ ] 验收：期望纸面均有眉；续页行为与档 2 预览一致  
