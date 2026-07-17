# ReportEditor：AI 悬浮按钮与对话面板可拖动（避免遮挡）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：已实现 · **0.3.103**。  
> **发现**：2026-07-17 · 用户提出。  
> **相关**：[`AiDrawer.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/AiDrawer.vue)、[`floating-pos.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/floating-pos.ts)、[`AiSettingsSection.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/settings/ai-assistant/AiSettingsSection.vue)。  
> **范围**：桌面 Electron + 浏览器；FAB 可拖；**仅「展开」态**对话窗可拖；遮罩改灰、点外不关；既有调宽逻辑保留。

---

# ✅ 已完成：AI 按钮与展开态对话窗可拖并记忆（0.3.103）

## 产品诉求

1. 右下角 **AI** 悬浮按钮常挡住分页、底栏操作、表格把手等 → 可拖走。  
2. **展开后的 AI 对话窗**也会挡内容 → 可拖标题栏挪开。  
3. 松手后位置**记住**；FAB 拖与点要区分，避免误开。  
4. 打开后仍能看清背后页面；误点外面不要关窗。

## 已拍板（2026-07-17）

| # | 结论 |
|---|------|
| **Q1** | **A**：视口内任意拖，边缘 ≥8px 安全距（不做四边磁吸） |
| **Q2** | **A**：`localStorage` 本机记忆（不写服务端 prefs） |
| **Q3** | **A**：FAB 位移 >5px 算拖、不打开；未过阈值算点击打开 |
| **Q4** | **A**：设置 → AI 助手增加「恢复 AI 按钮/对话窗默认位置」 |
| **Q5** | **仅「展开」态可拖对话窗**：拖标题栏；**侧栏态不可拖**；关闭态拖 FAB |
| **Q6** | 默认落点仍右下 |
| **Q7** | FAB 与对话窗位置**独立**记忆 |
| **Q8** | 遮罩去 blur、浅灰半透明；**点击遮罩不关闭** |

### 位置记忆

| 键 | 内容 |
|----|------|
| `report-editor-ai-fab-pos` | FAB `{ left, top }` |
| `report-editor-ai-drawer-pos` | 展开态对话窗 `{ left, top }` |

## 落地

| 项 | 路径 |
|----|------|
| 纯函数 + 单测 | `floating-pos.ts` / `floating-pos.test.ts` |
| FAB / 展开拖 / 遮罩 | `AiDrawer.vue` |
| 设置重置 | `AiSettingsSection.vue`（事件 `report-editor-ai-floating-reset`） |

## 测试用例

### 单元（vitest · `floating-pos.test.ts`）

| ID | 用例 | 期望 |
|----|------|------|
| U1 | `isDragNotClick` 位移 ≤5px | `false`（算点击） |
| U2 | `isDragNotClick` 位移 >5px（含斜向） | `true`（算拖） |
| U3 | `clampFloatingPos` 超出左/上 | 钳到 pad=8 |
| U4 | `clampFloatingPos` 超出右/下 | 钳到 `viewport - size - pad` |
| U5 | `loadFloatingPos` 合法 JSON | 返回 `{ left, top }` |
| U6 | `loadFloatingPos` 缺键 / 非法 / 非有限数 | `null` |
| U7 | `clearAiFloatingPositions` | 两键均清除 |
| U8 | `defaultFabPos` | 近右下，且在 clamp 内 |

### 手测 · FAB

| ID | 步骤 | 期望 |
|----|------|------|
| H1 | 拖 FAB 离开右下 → 刷新 | 仍在拖后位置 |
| H2 | 轻点 FAB（几乎不动） | 打开对话；不误判为拖 |
| H3 | 拖一段后松手 | 不打开对话 |
| H4 | 设置「恢复默认位置」 | FAB 回右下；键已清 |

### 手测 · 侧栏

| ID | 步骤 | 期望 |
|----|------|------|
| H5 | 打开（未展开）拖标题栏 | 整窗**不动** |
| H6 | 侧栏左边调宽 grip | 宽度仍可调并记忆 |

### 手测 · 展开态

| ID | 步骤 | 期望 |
|----|------|------|
| H7 | 展开 → 拖标题栏空白区 | 整窗跟随移动 |
| H8 | 在模型下拉 / 新对话 / 收起 / 关闭上按下拖 | **不**启动整窗拖移；控件仍可点 |
| H9 | 拖到新位置 → 收起再展开 / 刷新后再开并展开 | 仍在上次展开位置 |
| H10 | 收起、关闭按钮 | 仍可用；Esc 收起展开 / 关侧栏逻辑不回归 |
| H11 | 展开态边缘调大小 | 仍可用；与拖移不严重打架 |

### 手测 · 遮罩与设置

| ID | 步骤 | 期望 |
|----|------|------|
| H12 | 打开对话看背后页面 | 无 blur；偏灰半透明，内容可读 |
| H13 | 点击遮罩（面板外） | **不关闭**；仅 × / 关抽屉入口关闭 |
| H14 | 缩窄浏览器窗口 | FAB / 展开窗不掉出可视区 |
| H15 | 恢复默认后再展开 | 对话窗回默认居中（无记忆 left/top） |

## 验收

- [x] U1–U8 单测通过  
- [ ] H1–H4 FAB（手测）  
- [ ] H5–H6 侧栏（手测）  
- [ ] H7–H11 展开（手测）  
- [ ] H12–H15 遮罩 / 重置 / 缩窗（手测）  

## 不做（本条）

- 不做服务端同步位置  
- 不做四边磁吸  
- **侧栏态不拖移整窗**（展开后再拖）  
- 不做点透遮罩操作背后页面（仅可见、点外不关）  
