# ReportEditor 控件默认无边框

> 产品计划：[`009_版本Plan/0.3.61.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.61.md)。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅文档**：纠正需求理解后再改代码 / 发版。

---

# ⌛️ 未完成：新建控件默认「边框 → 隐藏」（`showBorder=false`）

## 纠正说明（2026-07-13）

此前文档误写成「设置页 / 数据源表单 CSS 去掉灰边」。  
**实际需求**是模版/版式属性面板里这一项（截图已确认）：

- 标题：**边框**
- 分段：**显示** / **隐藏**
- 说明文案：*预览与导出 PDF 时是否绘制控件外框；编辑选中描边不受影响。*

对应字段：`showBorder`（`TemplateElement` / 版式 `LayoutZoneElement`）。

| 是什么 | 不是什么 |
|--------|----------|
| 预览 / 导出 PDF 时控件**外框**是否绘制 | 编辑器里选中时的蓝色选中描边 |
| 属性面板「边框 → 显示/隐藏」 | 设置页 input、数据源按钮的 CSS `border` |
| 模型默认值 `showBorder` | 全局 UI 皮肤改版 |

## 目标

**新建**到画布上的控件，属性「边框」默认应为 **隐藏**（`showBorder: false`），预览与 PDF 默认不画浅灰外框；用户仍可手动改为「显示」。

## 强制同步：模版 + 版式（不可只改一侧）

模版正文与版式（页眉/页脚/封面封尾区等）各有一套模型与属性面板，**两边都必须改**，否则会出现「模版新建无边、版式新建仍有边」或反过来。

| 侧 | 新建默认 | 属性面板 | 画布/预览渲染（核对） |
|----|----------|----------|----------------------|
| **模版** | `model.ts` → `defaultElement` / `makeElement` | `TemplateElementProps.vue` | `TemplateBodyCanvas`、`TemplateMiniPage` 等 |
| **版式** | `layout-zone-element.ts` 默认区 / 新建 zone | `LayoutPresetElementProps.vue` | `LayoutPresetPaperCanvas`、`LayoutPresetMiniPage` 等 |

实现与验收均以「两侧行为一致」为通过条件；单测至少各覆盖一侧新建默认 + 一侧旧稿缺字段兼容。

## 现状（代码）

| 位置 | 行为 |
|------|------|
| 模版 `model.ts` → `defaultElement()` | `showBorder: true`（新建默认**显示**） |
| 版式 `layout-zone-element.ts` 默认区 | 同样默认 `true`（**必须与模版一并改掉**） |
| `normalizeShowBorder`（共用） | 缺省字段走 fallback；注释写明「缺省 true 兼容旧模版」；模版/版式加载都应遵守同一兼容规则 |
| `TemplateElementProps.vue` / `LayoutPresetElementProps.vue` | `el.type !== 'table'` 时展示「边框」分段（两侧 UI 已对齐，改的是默认值不是面板） |
| 渲染 | `TemplateBodyCanvas` / `TemplateMiniPage` / `LayoutPresetPaperCanvas` 等：`showBorder === false` → `border: none`，否则浅灰外框 |

## 要改默认的控件类型（模版与版式同类均适用）

属性面板对 **表格以外** 的控件提供「边框」开关；下列类型在**模版新建**与**版式新建**两条路径上，默认都改为隐藏：

| 类型 | 说明 |
|------|------|
| `text` | 文本 |
| `box` | 色块 |
| `image` | 图片（截图场景） |
| `date` | 日期时间 |
| `parameter` | 数据参数 |
| `chart` | 图表 |
| `signature` | 签名 |

| 类型 | 本条是否改 |
|------|------------|
| `table` | **完全不碰**（已拍板）：不改新建默认、不改属性面板、一键隐藏**跳过**表格；不触碰表格网格线 / 单元格边 |

## 兼容策略（实现必须遵守）

旧**模版与版式** JSON **往往未写** `showBorder` 字段。若简单把新建默认改成 `false`，且加载时用新默认作 missing fallback，会导致**旧稿预览/PDF 突然全部无外框**。

| 场景 | 期望 |
|------|------|
| **新建**控件（模版或版式画布拖入/插入） | `showBorder: false`（属性面板默认停在「隐藏」） |
| **打开旧文件**且 JSON **无** `showBorder`（模版或版式） | 仍视为 **显示**（`true`），保持历史外观 |
| 旧/新文件已显式写 `true`/`false` | 尊重文件值 |

实现要点：加载路径对「字段缺失」固定兼容为 `true`；仅模版 `defaultElement`/`makeElement` **与** 版式新建默认改为 `false`。

## 明确不改

- **表格控件**（已拍板：默认 / 面板 / 一键均不碰）  
- 编辑选中描边、缩放手柄、表格单元格网格线  
- 设置页 / 数据源 / AI 抽屉等 **应用 UI 表单边框**（另需求另开看板）  
- 已保存模版/版式里用户设过的「显示/隐藏」（除非用户点「一键隐藏」）

## 拟改步骤（确认后开工）

1. 模版 `defaultElement` **与** 版式默认：同时改为 `showBorder: false`。  
2. 加载兼容：`hydrateTemplateElement` / `hydrateLayoutZoneElement` 在字段**缺失**时固定为 `true`（勿再把 `d.showBorder` 当 missing fallback）。`normalizeShowBorder` 可保留，但调用处必须传兼容默认或改为「缺省恒 true」。  
3. 后端 `schemas/report_template.py` 等模型默认若影响「新建」路径，与前端对齐核对（旧 JSON 入 API 仍应偏兼容显示）。  
4. 按下方**测试矩阵**补单测并跑绿。  
5. 目视：模版/版式新建图片 →「隐藏」；旧稿外观不变。  
6. bump **0.3.61**（或并入当时发版线）。

## 测试用例（当前不足 → 实现前必须补齐）

### 现状结论

| 项 | 状态 |
|----|------|
| 前端 `showBorder` / `normalizeShowBorder` 专项单测 | **无**（`report-template.test.ts` 等均未覆盖） |
| 文档先前只写「拟改步骤第 3 点」提纲 | **不够**，缺矩阵与失败断言 |
| 手工验收 | 有提纲，但未写成可勾选用例 |

实现本需求时，至少落地下表 **A–C 自动化** + **D 手工**；缺任一侧（模版/版式）视为不通过。

### A. 单元：新建默认（模版 + 版式）

| # | 用例 | 断言 |
|---|------|------|
| A1 | `makeElement("image" \| "text" \| "box" \| "date" \| "parameter" \| "chart" \| "signature")` | `showBorder === false` |
| A2 | `makeLayoutZoneElement` 同上各类型（版式有的类型） | `showBorder === false` |
| A3 | `defaultElement` / `defaultLayoutZoneElement` 与 make 一致 | 与 A1/A2 相同 |
| A4 | `makeElement("table")` / `makeLayoutZoneElement("table")` | **断言默认值与改前一致**（不因本需求改动）；网格相关逻辑无回归 |

### B. 单元：加载兼容（防旧稿变无边）

| # | 用例 | 断言 |
|---|------|------|
| B1 | `hydrateTemplateElement({ type: "image", id: "x" })`（**无** `showBorder` 键） | `showBorder === true` |
| B2 | `hydrateLayoutZoneElement({ type: "image", id: "x" })`（无键） | `showBorder === true` |
| B3 | hydrate 显式 `showBorder: false` | `=== false` |
| B4 | hydrate 显式 `showBorder: true` | `=== true` |
| B5 | hydrate 字符串/数字边界（若 `normalizeShowBorder` 仍支持 `"false"` / `0`） | 与现函数语义一致 |
| B6 | **回归锁**：新建默认已是 `false` 时，B1/B2 仍必须为 `true`（证明 missing 未误用新默认） |

### C. 单元：同步与传递（可选但建议）

| # | 用例 | 断言 |
|---|------|------|
| C1 | `layout-apply` 版式 zone → 模版元素（或反向，若有） | `showBorder` 原样拷贝 |
| C2 | 剪贴板复制 `makeElement` 后再 hydrate 快照 | 显式 `false` 不丢 |

### D. 手工验收（发版前勾选）

| # | 步骤 | 期望 |
|---|------|------|
| D1 | 新建模版，拖入图片 | 属性「边框」为**隐藏**；预览无浅灰外框 |
| D2 | 新版式（页眉/正文区），拖入图片 | 同上，与模版一致 |
| D3 | 改为「显示」再「隐藏」 | 预览外框随之出现/消失 |
| D4 | 选中控件 | 编辑选中描边仍在 |
| D5 | 打开改版前保存的、从未写过 `showBorder` 的旧模版 | 外框仍在（与改前一致） |
| D6 | 打开同类旧版式 | 同上 |

### 建议落点

- 新建 `frontend/src/lib/report-template/show-border-default.test.ts`（或并入 `report-template.test.ts`）。  
- 实现时先红后绿：先写 B6/A1，再改默认与 hydrate。

## 验收

1. **模版**：拖入图片/文本等（非表）→「边框」默认隐藏；预览/导出无浅灰外框。  
2. **版式**：同上 → 默认隐藏，行为与模版一致。  
3. 改为「显示」后预览出现外框；再改回「隐藏」消失（两侧各抽查一次）。  
4. 编辑选中描边始终可用。  
5. 打开未含 `showBorder` 的旧模版 **与** 旧版式：外框行为与改前一致（仍显示）。  
6. **测试矩阵 A+B（建议含 C）全绿**；D 手工勾选完成。  
7. **一键隐藏**（见下一 H1）模版/版式均可用，且**不改动表格**。

## 已拍板

- [x] **表格控件完全不碰**（默认/面板/一键均跳过）。  
- [x] **需要「一键边框隐藏」**（模版 + 版式同步提供；详见下一 H1）。

---

# ⌛️ 未完成：一键将当前页非表格控件边框设为隐藏

## 诉求（2026-07-13 拍板）

除「新建默认隐藏」外，还要能对**已有**控件批量处理：一键把边框全部隐藏，避免旧稿逐个点「隐藏」。

## 范围

| 项 | 约定 |
|----|------|
| 作用对象 | 当前编辑中的**当前页 / 当前区**内，所有 `type !== "table"` 且目前会画外框的控件 → `showBorder = false` |
| 模版 | 模版编辑器提供入口（工具栏或属性区附近） |
| 版式 | 版式编辑器同样提供入口（**强制同步**，不可只做模版） |
| 表格 | **跳过**，不改 `table`，不改网格线 |
| 已是隐藏的 | 保持 `false`，幂等 |
| 撤销 | 应纳入现有 undo（若编辑器有历史栈）；实现时接同一套 mutation |

> 若产品要「整本模版所有页一次隐藏」，可二期扩展；**本版默认：当前页/当前区**，避免误伤其它页。

## 拟改

1. 抽纯函数（便于单测），例如：  
   `hideShowBordersInElements(els: { type; showBorder }[]): number`  
   → 对非 table 写 `showBorder=false`，返回修改个数。  
2. 模版编辑器、版式编辑器各绑一按钮：「一键隐藏边框」（文案可再定）。  
3. 无改动时按钮可禁用或 toast「没有可隐藏的边框」。

## 测试用例

### E. 单元：一键隐藏

| # | 用例 | 断言 |
|---|------|------|
| E1 | 混合 `image(true)` + `text(true)` + `table(...)` | 前两者 → `false`；**table 字段不变** |
| E2 | 已全部 `false` | 返回修改数 0；对象不变（或等价） |
| E3 | 仅 table | 修改数 0 |
| E4 | 模版元素数组与版式 zone 数组各跑一遍（或共用泛型函数） | 行为一致 |

### F. 手工

| # | 步骤 | 期望 |
|---|------|------|
| F1 | 旧模版一页多个有外框控件 → 点一键 | 预览外框消失；表格外观不变 |
| F2 | 版式同上 | 与模版一致 |
| F3 | Undo（若有） | 可恢复外框 |

## 验收

1. 模版/版式均有一键入口，当前页非表格控件外框隐藏。  
2. 表格完全不被修改。  
3. E 单测绿；F 手工通过。

---

# ⌛️ 未完成：实现、测试与发版 0.3.61

- 新建默认隐藏（H1-1）+ 一键隐藏（H1-2）+ 矩阵 A/B/E（建议 C）+ 手工 D/F；bump、Mac 包、发布记录与看板收尾。
