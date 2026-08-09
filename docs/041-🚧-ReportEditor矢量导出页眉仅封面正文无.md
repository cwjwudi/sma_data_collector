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

- `pdf-lib-layout-v2-render.test.ts`「041: header/footer are drawn on SQL continuation pages」：40 行静态表撑 2+ 卡，断言**每页**均含页眉文本与 `n/N` 页脚页码。  
- 全量 vitest：**107 文件 / 624 用例全绿**（2026-08-08）。

---

# ✅ 已完成：H1/H4——封面与正文页眉独立 + 一键复制（2026-08-09）

## 定性

封面与正文页眉在数据模型上 **完全独立**（`coverHeaderElements` vs `headerElements`；`layout-apply` 按槽写入）。Mini / Chromium 同样分槽——**不是矢量独有**。用户常误以为「封面配了眉，正文也会有」（H4）。

| ID | 假设 | 状态 |
|----|------|------|
| H1 | 模板数据：仅封面有眉（`coverHeaderElements` 有、`headerElements` 空） | ✅ 按此产品路径处理（提示 + 一键复制） |
| H2 | SQL 续页藏 chrome | ✅ 已修（见上） |
| H3 | 正文眉带高度 0 | 部分缓解：复制时若封面 `headerBandMm` 更高则抬升正文带高 |
| H4 | 误以为封面眉会继承到正文 | ✅ 并入提示与一键复制 |

## 实现

| 位置 | 变更 |
| ---- | ---- |
| `copy-sheet-bands.ts` | `copyCoverHeaderToBody`：深拷封面眉控件（新 id）+ `headerText`；必要时抬升正文 `headerBandMm`；`templateNeedsCoverHeaderCopyHint` |
| `TemplateEditorWorkspace.vue` | 工具栏「封面页眉→正文」（覆盖前 `appConfirm`）；sheet/preset 文案标明「互不继承」；封面有眉正文无时黄条提示 |
| `copy-sheet-bands.test.ts` | 拷贝/抬高眉带/覆盖语义 |

## 使用

1. 打开模版编辑器 → 若黄条提示「封面有页眉、正文暂无」→ 点「封面页眉→正文」→ 保存。  
2. 或在「版式与页眉页脚」为**正文**版式单独配页眉后套用到正文槽。

---

# ⌛️ 未完成：现场样本对照

- [x] H2 续页漏眉脚：已修复 + 对抗测试  
- [x] H1/H4 产品：独立提示 + 一键复制（本机单测）  
- [ ] 现场重导同模版档 1 PDF：确认「SQL 撑开第 2+ 张」的眉脚恢复（H2）  
- [ ] 若第一张正文曾无眉：用「封面页眉→正文」后重导，验收正文亦有眉  
- [ ] 验收：期望纸面均有眉；续页行为与档 2 预览一致  
