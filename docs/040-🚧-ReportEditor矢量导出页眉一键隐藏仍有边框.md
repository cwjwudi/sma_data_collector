# ReportEditor：矢量导出 · 页眉一键隐藏边框后仍有边框

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**（`frontend/package.json` 与 Portal Setup 一致）。  
> **范围**：导出性能档 **1「矢量版式」**（`layout-v2` / pdf-lib）。  
> **关联**：[005](005-✅-ReportEditor控件默认无边框.md) · [036](036-✅-ReportEditor矢量档与预览稳样式对照.md) · [035](035-🚧-ReportEditor导出性能档位与同机降载.md)。

---

# 🚧 进行中：现象与根因排查

## 现象

- 已在编辑器点击「一键隐藏边框」。  
- 预览里页眉外框似已隐藏（或用户以为已隐藏）。  
- **档 1 矢量导出** PDF 中页眉区域仍可见边框线。

## 代码根因（本机已核对路径）

存在 **多层独立原因**，需对照现场模板拆开确认：

### A. 模版编辑器「一键隐藏」不碰页眉带（高概率）

| 入口 | 实际作用范围 |
|------|----------------|
| 模版 `TemplateEditorWorkspace.hideBordersOnCurrentPage` | **仅** `bodyElementsRef(当前 sheet / 正文页)` → 封面正文 / 正文页 / 封尾正文 |
| 版式 `LayoutPresetEditor.hideBordersOnPresetPage` | 页眉 + 正文 + 页脚三带 |

页眉控件在 `coverHeaderElements` / `headerElements` / `backHeaderElements`。  
在**模版编辑器**点「一键隐藏」时 **不会** 改这些数组 → 矢量仍按 `showBorder !== false` 描 chrome。

证据：`docs/005` 已写明「模版：当前 sheet + 当前正文页；版式：三带」。

### B. 一键隐藏故意跳过 `table`（高概率 · 页眉叠表场景）

`hideShowBordersInElements`：`if (el.type === "table") continue`。  
页眉常见「标题 + zone 表」；表网格线在 Mini CSS（`.mini-tpl-td` 四边）与 layout-v2 `drawZoneTable`（**无视 `showBorder`，始终画 `TABLE_GRID_BORDER`**）都会出现。  
用户说的「边框」经常是 **表格格线/外框**，不是属性面板的控件 chrome。

### C. 矢量对非表控件：`showBorder === false` 本可隐藏 chrome

`pdf-lib-layout-v2-render.ts` zone 文本/参数路径有 D10：`showBorder === false` 不描 stroke（单测 `D10` 已覆盖正文 text）。  
若 JSON 里页眉控件已是 `showBorder: false` 仍见线 → 更像 **B（表线）** 或其它描边（角色色顶条见 021，非控件框）。

## 本机逻辑复现（无需现场包）

1. **A**：模版封面 sheet 点「一键隐藏」→ 查 JSON：`coverElements.*.showBorder` 变 false，`coverHeaderElements` 仍为 true/缺省。  
2. **B**：页眉仅有 table、或一键后 table 仍 `showBorder: true` → 矢量仍画满格线。  
3. **对照**：同模板档 2 Chromium：表线同样在（Mini 表 CSS 不吃 `showBorder`）；若档 2 也有「边框」，产品语义是「表线 ≠ 一键隐藏对象」。

相关单测（已跑绿）：`show-border-default.test.ts`（一键跳过 table）；`pdf-lib-layout-v2-render` D10（非表 chrome）。

## 建议修复方向

1. **模版一键隐藏**：与版式对齐，同时处理当前 sheet 的 header/footer（封面→`coverHeader/Footer`，正文→`header/footer`，封尾同理）。  
2. **文案/验收**：按钮提示改为「隐藏控件外框（不含表格格线）」；或另提供「隐藏表格格线」产品开关（需明确是否改 Chromium 表 CSS）。  
3. **layout-v2**：若产品决定 `table.showBorder === false` 时不画外框/格线，则 `drawZoneTable` / 正文表路径需读该字段（并与 Mini 同步）。  
4. 补单测：模版一键后 `coverHeaderElements` 全 false；zone 表 `showBorder:false` 的矢量期望（按产品决议）。

## 需要补充的信息（辅助修复）

| # | 请提供 |
|---|--------|
| 1 | 准确版本号（About / `latest.json` / 安装包文件名），确认是否即口述「144」 |
| 2 | 在**模版**还是**版式库**点的「一键隐藏」？点之前当前页是封面还是正文？ |
| 3 | 问题 PDF + 同戳档 2 PDF（或五档批导目录） |
| 4 | 模板导出 JSON（至少 `coverHeaderElements` / `headerElements` 各控件的 `type`、`showBorder`） |
| 5 | 「边框」指：控件灰描边、表格格线、还是封面橙色角色条？可标注截图 |
| 6 | Chromium「预览稳」是否同样有该线？ |

---

# ⌛️ 未完成：按补充样本修复并验收

- [ ] 拿齐上表样本后选定 A/B/C 主因  
- [ ] 合入修复 + 单测  
- [ ] 现场/本机：一键后档 1 页眉无「所指边框」；表线行为与产品文案一致  
