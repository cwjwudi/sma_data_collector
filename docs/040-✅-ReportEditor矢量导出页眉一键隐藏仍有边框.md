# ReportEditor：矢量导出 · 页眉一键隐藏边框后仍有边框

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**。  
> **闭环版本**：**0.3.146**（2026-08-04）。  
> **范围**：导出性能档 **1「矢量版式」** 及同源 `showBorder` 数据（档 0/2–4 一并受益）。  
> **关联**：[005](005-✅-ReportEditor控件默认无边框.md) · [036](036-✅-ReportEditor矢量档与预览稳样式对照.md) · [035](035-🚧-ReportEditor导出性能档位与同机降载.md)。

---

# ✅ 已完成：现象与根因（A CONFIRMED）

## 现象

- 模版编辑器点「一键隐藏边框」后，**页眉控件灰色描边**在矢量导出中仍在。  
- 「边框」= 控件 chrome（`showBorder`），不是表格格线、不是角色色条。  
- 产品口径：模版与版式库两处一键均应覆盖页眉/页脚。

## 根因

| ID | 结论 |
|----|------|
| **A** | 模版 `hideBordersOnCurrentPage` 旧实现**只**改 `bodyElementsRef`，不碰 `coverHeader*` / `header*` / `*Footer*` / bodyDecor |
| B | 一键跳过 table — 与本缺陷无关（已确认所指为灰描边） |
| C | 各档渲染均读 `showBorder`；问题在写数据，非矢量独画 |

版式库三带路径原先已正确。

---

# ✅ 已完成：修复与跨档对齐（0.3.146）

## 代码

| 项 | 做法 |
|----|------|
| 纯函数 | `hideBordersOnTemplateSheet` / `hideBordersOnLayoutPresetBands` / `chromeBorderCss` / `sheetShowBorderSnapshot`（`show-border.ts`） |
| 模版入口 | `TemplateEditorWorkspace` → 当前 sheet 页眉+页脚+正文页+zone 装饰 |
| 版式入口 | `LayoutPresetEditor` 改走共享 helper（行为不变） |
| 编辑器可见性 | `TemplateBodyCanvas` / `LayoutPresetPaperCanvas` zone 文本补灰描边，与 Mini/导出一致（此前编辑器漏画，难验收） |
| Mini | 灰描边 CSS 走 `chromeBorderCss` |
| 附带 | `launch.cjs` `decodeWindowsConsole` 在非 Win 也试 GBK（修 mac 单测 037c） |

## 对抗测试（vitest）

| 组 | 覆盖 |
|----|------|
| G1 | 旧路径只改正文 → 页眉仍 true（回归对照） |
| G2 | 封面：眉/脚/装饰/正文 false；table 跳过 |
| G3 | 正文多页：只改当前页+共享眉脚；封面不动 |
| G4 | 封尾独立 + 幂等 |
| G5 | 版式三带 helper |
| G6 | 040 JSON 样例修好前→后 |
| F1 | Chromium/Mini `chromeBorderCss` 契约 |
| D10h | layout-v2：封面页眉 `showBorder:true` 有 chrome；一键后 PDF 无 chrome 色 |

**门禁**：`npm test` → **106 files / 602 tests passed**（含上述）。

## 验收清单

- [x] 模版一键覆盖当前 sheet 页眉/页脚  
- [x] 单测页眉非表 `showBorder === false`  
- [x] 矢量 PDF chrome 对抗（D10h）  
- [x] Chromium CSS 契约（F1；数据同源 → 档 2–4 同受益）  
- [x] 版式库路径保持三带  
- [ ] 现场装包目视：模版封面一键后档 1+2 页眉无灰框（发版后）

---

# ✅ 已完成：模板 JSON 对照样例

修好前（旧 bug）：正文 `false`、页眉仍 `true`。修好后：当前 sheet 眉/脚/正文非表均为 `false`。详见历史段落或单测 G6。
