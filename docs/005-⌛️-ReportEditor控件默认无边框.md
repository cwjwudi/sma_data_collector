# ReportEditor 控件默认无边框

> 产品计划：[`009_版本Plan/0.3.61.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.61.md)（原拟 0.3.60；0.3.60 改挂 AI 探活生效）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅文档**：确认范围与规则后再改 CSS / 发版。

---

# ⌛️ 未完成：统一交互控件默认无边框

## 目标

报表编辑器 AI 版中，**交互控件的默认态不再画实线边框**（更轻、少「框框感」），与渐变主区/浅色面板更协调。

## 「控件」范围（默认纳入）

| 纳入 | 典型选择器 / 位置 |
|------|-------------------|
| 文本输入 | `input.input`、`textarea`、数字框 |
| 下拉 | `select.input` |
| 按钮（次要/默认） | `.btn`、`.btn.seg`、`.btn.sm`、`.btn.ghost` |
| 分段/小 Tab 按钮 | `.seg-tabs button`、`.tabs-conn .tab`（非选中态） |
| 设置页表单控件 | `settings-sections.css` 内 input/select/button |

## 明确不纳入（保持现有分区边框）

| 不纳入 | 原因 |
|--------|------|
| 区块容器 | `.settings-section`、`.conn-form-pane`、`.work`、侧栏面板 — 这是**布局分区**，不是表单控件 |
| 对话框外框、画布选中框、表格网格线 | 结构/编辑语义，去边框会丢信息 |
| 错误/警告条、危险描边 | 状态反馈依赖边框或等效强调 |
| 原生 `outline` 在 `:focus-visible` | **无障碍保留**（可用 outline，不靠默认 border） |

> 若产品希望「面板容器也无边框」，需另开 H1，不在本条默认范围。

## 视觉规则（拟）

1. **默认态**：`border: none`（或 `1px solid transparent` 以稳住尺寸，避免 focus 时布局跳动）。
2. **悬停（可选）**：可用浅底或极淡边，不强制恢复粗灰框。
3. **焦点**：`:focus-visible { outline: 2px solid … }`（或等价），**禁止**「只有默认灰边、无焦点环」。
4. **选中/激活**（如 `.tab.on`、`.btn.primary`）：可用底色/字色区分；若需边框仅限选中态。
5. **禁用**：降低透明度即可；不必加边框。
6. **危险按钮**（`.btn.danger`）：可用字色/浅红底表达；默认态仍可无边，或仅危险态保留细边（实现时二选一，优先无边+字色）。

## 实现策略（确认后开工）

1. 抽/扩**全局控件 token**（建议 `frontend/src/style.css` 或新建 `controls.css`）：
   - `--ctrl-border: none` / transparent
   - `--ctrl-focus-ring: …`
2. 优先改**共用层**，避免逐页打补丁：
   - `connection-form-pane.css`（`.input` / `select.input`）
   - `datasource-ui.css`（`.btn` / `.seg-tabs`）
   - `connection-tabs.css`（`.tab`）
   - `settings-sections.css`（设置表单控件）
3. 扫描剩余 `border: 1px solid #d1d5db` / `#d4d4d8` 挂在 input/button 上的局部样式，改为继承 token 或删除默认边。
4. **契约测试**：对关键共用 CSS 断言「默认 `.input` / `.btn` 不含实线 border」（或等价源码契约），防止回潮。

## 验收

1. 数据源连接表单、OPC 表单、设置页常见 input/button：**静置无可见边框**。
2. Tab / 新建按钮未选中时无粗灰框；选中态仍可辨。
3. 键盘 Tab 聚焦时焦点环清晰（无障碍不回退）。
4. 区块面板（settings-section / conn-form-pane）边框是否保留：按上文「不纳入」默认保留。
5. `npm test` 含 CSS/控件契约；Mac 目视抽查数据源 + 设置。

## 待你拍板（写进实现前）

- [ ] 面板容器（`.conn-form-pane` / `.settings-section`）是否也去边？**文档默认：不去。**
- [ ] Primary 按钮是否完全无边只靠底色？**文档默认：无边 + 实心底。**

---

# ⌛️ 未完成：实现、测试与发版 0.3.60

- bump、看板收尾 ✅、Mac 包、`latest.json` / `007` / `todo.md`。
